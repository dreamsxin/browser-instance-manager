# 最佳实践指南

## 概述

本文档提供使用浏览器实例管理器的最佳实践，帮助您构建高效、稳定和可维护的浏览器自动化应用。

## 核心原则

### 1. 资源管理
- 🎯 **及时清理**：不使用的时候及时关闭实例
- 🎯 **合理限制**：根据系统资源设置实例上限
- 🎯 **监控使用**：实时监控资源消耗

### 2. 错误处理
- 🎯 **优雅降级**：处理各种异常情况
- 🎯 **重试机制**：对临时性错误进行重试
- 🎯 **健康检查**：定期检查实例健康状态

### 3. 性能优化
- 🎯 **连接复用**：尽可能复用现有连接
- 🎯 **缓存策略**：合理使用缓存减少重复工作
- 🎯 **并行处理**：充分利用多实例并行能力

## 实例管理最佳实践

### 1. 生命周期管理

```javascript
class BrowserLifecycleManager {
  constructor(manager) {
    this.manager = manager;
    this.instances = new Map();
  }

  // 安全启动实例
  async safeLaunch(instanceId, options = {}) {
    try {
      // 检查是否已存在
      if (this.instances.has(instanceId)) {
        await this.safeStop(instanceId);
      }

      const instance = await this.manager.launch(instanceId, options);
      this.instances.set(instanceId, {
        instance,
        startTime: Date.now(),
        activityCount: 0
      });

      return instance;
    } catch (error) {
      console.error(`Failed to launch instance ${instanceId}:`, error);
      throw error;
    }
  }

  // 安全停止实例
  async safeStop(instanceId) {
    try {
      if (this.instances.has(instanceId)) {
        await this.manager.stop(instanceId);
        this.instances.delete(instanceId);
      }
    } catch (error) {
      console.warn(`Error stopping instance ${instanceId}:`, error);
      // 强制从本地记录中移除
      this.instances.delete(instanceId);
    }
  }

  // 自动清理空闲实例
  startAutoCleanup(checkInterval = 60000, maxIdleTime = 300000) {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [instanceId, info] of this.instances) {
        const idleTime = now - info.lastActivity;
        if (idleTime > maxIdleTime) {
          console.log(`Cleaning up idle instance: ${instanceId}`);
          this.safeStop(instanceId);
        }
      }
    }, checkInterval);
  }
}
```

### 2. 连接池模式

```javascript
class BrowserConnectionPool {
  constructor(manager, poolSize = 5) {
    this.manager = manager;
    this.poolSize = poolSize;
    this.available = [];
    this.inUse = new Set();
    this.waitingQueue = [];
  }

  async getConnection() {
    // 如果有可用连接，直接返回
    if (this.available.length > 0) {
      const instanceId = this.available.pop();
      this.inUse.add(instanceId);
      return this.createConnectionProxy(instanceId);
    }

    // 如果还可以创建新连接
    if (this.inUse.size + this.available.length < this.poolSize) {
      const instanceId = `pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await this.manager.launch(instanceId, {
        mode: 'launchServer',
        browser: 'chromium'
      });
      
      this.inUse.add(instanceId);
      return this.createConnectionProxy(instanceId);
    }

    // 等待可用连接
    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  releaseConnection(instanceId) {
    this.inUse.delete(instanceId);
    this.available.push(instanceId);

    // 通知等待的请求
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift();
      resolve(this.getConnection());
    }
  }

  createConnectionProxy(instanceId) {
    return {
      instanceId,
      newPage: async (options) => {
        const { page, context } = await this.manager.newPage(instanceId, options);
        
        // 重写关闭方法，释放连接到池中
        const originalClose = context.close.bind(context);
        context.close = async () => {
          await originalClose();
          this.releaseConnection(instanceId);
        };

        return { page, context };
      },
      release: () => {
        this.releaseConnection(instanceId);
      }
    };
  }
}
```

## 错误处理最佳实践

### 1. 健壮的错误处理框架

```javascript
class RobustBrowserOperations {
  constructor(manager) {
    this.manager = manager;
  }

  async withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // 分类错误类型
        const errorType = this.classifyError(error);
        
        // 不可恢复错误，立即抛出
        if (this.isFatalError(error)) {
          throw error;
        }

        // 可恢复错误，等待后重试
        if (attempt < maxRetries) {
          console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
          await this.sleep(delay * attempt); // 指数退避
        }
      }
    }
    
    throw lastError;
  }

  classifyError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('network') || message.includes('socket')) return 'network';
    if (message.includes('target closed') || message.includes('browser disconnected')) return 'browser_disconnected';
    if (message.includes('navigation')) return 'navigation';
    
    return 'unknown';
  }

  isFatalError(error) {
    const fatalPatterns = [
      'out of memory',
      'no such file',
      'permission denied',
      'invalid argument'
    ];
    
    return fatalPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern)
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 安全页面操作
  async safePageOperation(instanceId, operation, options = {}) {
    return this.withRetry(async () => {
      const { page, context } = await this.manager.newPage(instanceId, options);
      
      try {
        const result = await operation(page);
        await context.close();
        return result;
      } catch (error) {
        // 确保上下文被关闭
        try {
          await context.close();
        } catch (closeError) {
          console.warn('Error closing context:', closeError);
        }
        throw error;
      }
    }, options.maxRetries, options.retryDelay);
  }
}
```

### 2. 实例健康监控

```javascript
class InstanceHealthManager {
  constructor(manager) {
    this.manager = manager;
    this.healthChecks = new Map();
  }

  startHealthMonitoring(instanceId, checkInterval = 30000) {
    const checkHealth = async () => {
      try {
        const instance = this.manager.getInstance(instanceId);
        if (!instance) {
          this.stopHealthMonitoring(instanceId);
          return;
        }

        // 执行健康检查
        const isHealthy = await this.performHealthCheck(instanceId);
        
        if (!isHealthy) {
          console.warn(`Instance ${instanceId} is unhealthy, attempting recovery...`);
          await this.manager.recoverInstance(instanceId);
        }
      } catch (error) {
        console.error(`Health check failed for ${instanceId}:`, error);
      }
    };

    const intervalId = setInterval(checkHealth, checkInterval);
    this.healthChecks.set(instanceId, intervalId);
    
    // 立即执行一次检查
    checkHealth();
  }

  stopHealthMonitoring(instanceId) {
    const intervalId = this.healthChecks.get(instanceId);
    if (intervalId) {
      clearInterval(intervalId);
      this.healthChecks.delete(instanceId);
    }
  }

  async performHealthCheck(instanceId) {
    try {
      const { page, context } = await this.manager.newPage(instanceId);
      
      // 简单健康检查：访问 about:blank
      await page.goto('about:blank', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
      await context.close();
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

## 性能优化最佳实践

### 1. 内存优化配置

```javascript
const memoryOptimizedConfig = {
  mode: 'launchServer',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      
      // 内存优化参数
      '--aggressive-cache-discard',
      '--max_old_space_size=2048',
      '--memory-pressure-off',
      '--max-active-webgl-contexts=0',
      '--max-tiles-for-interest-area=1',
      
      // 进程优化
      '--single-process',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    timeout: 30000
  },
  contextOptions: {
    // 减少内存使用
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
    bypassCSP: true
  }
};
```

### 2. 请求拦截优化

```javascript
class RequestOptimizer {
  static createOptimizedContext(instanceId, manager, options = {}) {
    return manager.newPage(instanceId, {
      ...options,
      setupPage: async (page) => {
        // 拦截不必要的请求
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          const url = route.request().url();
          
          // 阻止不必要的资源
          const blockedResources = [
            'image', 'font', 'media', 'websocket', 'manifest'
          ];
          
          if (blockedResources.includes(resourceType)) {
            return route.abort();
          }
          
          // 阻止广告和跟踪器
          if (this.isAdOrTracker(url)) {
            return route.abort();
          }
          
          route.continue();
        });
        
        // 设置缓存
        await page.setCacheEnabled(true);
      }
    });
  }

  static isAdOrTracker(url) {
    const adPatterns = [
      'googleads',
      'doubleclick',
      'adsystem',
      'analytics',
      'tracking',
      'beacon'
    ];
    
    return adPatterns.some(pattern => url.includes(pattern));
  }
}
```

## 安全最佳实践

### 1. 安全配置

```javascript
const secureBrowserConfig = {
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      // 安全参数
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // 隐私保护
      '--disable-features=TranslateUI',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      
      // 网络安全
      '--disable-web-security',
      '--allow-running-insecure-content'
    ],
    timeout: 30000
  },
  contextOptions: {
    // 安全上下文设置
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    
    // 权限设置
    permissions: [],
    
    // 用户代理
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};
```

### 2. 资源限制

```javascript
class ResourceLimiter {
  constructor(manager) {
    this.manager = manager;
    this.resourceUsage = new Map();
  }

  async launchWithLimits(instanceId, options = {}) {
    const limits = {
      maxMemory: 512, // MB
      maxPages: 10,
      maxRuntime: 3600000, // 1小时
      ...options.limits
    };

    const instance = await this.manager.launch(instanceId, options);
    
    this.resourceUsage.set(instanceId, {
      startTime: Date.now(),
      pageCount: 0,
      memoryUsage: 0,
      limits
    });

    // 监控资源使用
    this.startResourceMonitoring(instanceId);
    
    return instance;
  }

  startResourceMonitoring(instanceId) {
    const monitor = setInterval(async () => {
      const usage = this.resourceUsage.get(instanceId);
      if (!usage) {
        clearInterval(monitor);
        return;
      }

      // 检查运行时间
      const runtime = Date.now() - usage.startTime;
      if (runtime > usage.limits.maxRuntime) {
        console.warn(`Instance ${instanceId} exceeded max runtime, stopping...`);
        await this.manager.stop(instanceId);
        return;
      }

      // 这里可以添加内存监控逻辑
      // 注意：浏览器内存监控需要额外工具支持

    }, 30000); // 每30秒检查一次
  }
}
```

## 部署最佳实践

### 1. Docker 配置

```dockerfile
FROM node:18-alpine

# 安装 Playwright 依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji

# 设置环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# 复制 package.json 和安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S browseruser -u 1001

# 更改文件所有权
RUN chown -R browseruser:nodejs /app
USER browseruser

EXPOSE 3000

CMD ["node", "src/index.js"]
```

### 2. 环境特定配置

```javascript
// config/production.js
export const productionConfig = {
  defaultBrowser: 'chromium',
  defaultMode: 'launchServer',
  maxInstances: 5,
  timeout: 60000,
  logLevel: 'warn',
  healthCheckInterval: 30000,
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--aggressive-cache-discard',
      '--max_old_space_size=2048'
    ]
  }
};

// config/development.js
export const developmentConfig = {
  defaultBrowser: 'chromium',
  defaultMode: 'launch',
  maxInstances: 3,
  timeout: 30000,
  logLevel: 'debug',
  healthCheckInterval: 60000,
  options: {
    headless: false,
    devtools: true,
    slowMo: 100,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
};
```

## 监控和日志最佳实践

### 1. 结构化日志

```javascript
import { createLogger } from './utils/logger.js';

const logger = createLogger('info');

class MonitoredBrowserManager {
  constructor(manager) {
    this.manager = manager;
    this.setupMonitoring();
  }

  setupMonitoring() {
    this.manager.on('instanceCreated', (instanceId) => {
      logger.info('instance_created', { instanceId, timestamp: new Date().toISOString() });
    });

    this.manager.on('instanceStopped', (instanceId) => {
      logger.info('instance_stopped', { instanceId, timestamp: new Date().toISOString() });
    });

    this.manager.on('instanceError', (instanceId, error) => {
      logger.error('instance_error', { 
        instanceId, 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  async getMetrics() {
    const instances = this.manager.getAllInstances();
    const status = this.manager.getStatus();
    
    return {
      timestamp: new Date().toISOString(),
      instances: instances.length,
      running: status.runningInstances,
      utilization: (status.runningInstances / status.maxInstances) * 100,
      health: status.health
    };
  }
}
```

遵循这些最佳实践，您可以构建出高效、稳定且易于维护的浏览器自动化应用。

## 22. docs/troubleshooting.md

# 故障排除指南

## 概述

本文档提供浏览器实例管理器常见问题的诊断和解决方案，帮助您快速定位和解决问题。

## 常见问题索引

### 启动问题
- [浏览器启动失败](#浏览器启动失败)
- [实例创建超时](#实例创建超时)
- [内存不足错误](#内存不足错误)

### 连接问题
- [WebSocket 连接失败](#websocket-连接失败)
- [实例断开连接](#实例断开连接)
- [页面创建失败](#页面创建失败)

### 性能问题
- [内存泄漏](#内存泄漏)
- [CPU 使用率过高](#cpu-使用率过高)
- [响应缓慢](#响应缓慢)

### 配置问题
- [无效配置参数](#无效配置参数)
- [环境变量问题](#环境变量问题)
- [权限问题](#权限问题)

## 详细故障排除

### 浏览器启动失败

**症状：**
- 启动时抛出异常
- 浏览器进程无法创建
- 报错包含 "Could not find browser" 或 "Failed to launch"

**可能原因：**
1. Playwright 浏览器未安装
2. 系统依赖缺失
3. 权限不足
4. 端口被占用

**解决方案：**

1. **安装 Playwright 浏览器：**
```bash
# 安装所有浏览器
npx playwright install

# 或只安装特定浏览器
npx playwright install chromium
```

2. **检查系统依赖：**
```bash
# Ubuntu/Debian
sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

# CentOS/RHEL
sudo yum install -y alsa-lib atk at-spi2-atk cups-libs gtk3 libXcomposite libXdamage libXrandr libxkbcommon libdrm mesa-libgbm nss
```

3. **检查权限：**
```javascript
// 使用非root用户运行
if (process.getuid && process.getuid() === 0) {
  console.warn('Warning: Running as root user may cause permission issues');
}

// 或者在 Docker 中使用非root用户
// Dockerfile:
// USER node
```

4. **诊断脚本：**
```javascript
import { chromium } from 'playwright';

async function diagnoseBrowserIssue() {
  try {
    console.log('Testing browser launch...');
    const browser = await chromium.launch({ headless: true });
    console.log('✓ Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('✓ Page created successfully');
    
    await page.goto('about:blank');
    console.log('✓ Navigation successful');
    
    await browser.close();
    console.log('✓ Browser closed successfully');
    
    return true;
  } catch (error) {
    console.error('Browser diagnosis failed:', error);
    return false;
  }
}
```

### 实例创建超时

**症状：**
- 实例启动时间超过 30 秒
- 抛出 TimeoutError
- 系统负载较高时发生

**解决方案：**

1. **增加超时时间：**
```javascript
const manager = new BrowserManager({
  timeout: 60000,  // 60秒超时
  healthCheckTimeout: 10000
});

// 或者针对特定实例
await manager.launch('slow-instance', {
  mode: 'launch',
  options: {
    timeout: 120000  // 120秒
  }
});
```

2. **优化启动参数：**
```javascript
const optimizedOptions = {
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--single-process'  // 单进程模式，启动更快
  ],
  headless: true
};
```

3. **使用 LaunchServer 模式：**
```javascript
// 首次启动较慢，但后续连接很快
await manager.launch('server-instance', {
  mode: 'launchServer',
  options: {
    timeout: 120000
  }
});

// 后续页面创建非常快速
const { page } = await manager.newPage('server-instance');
```

### 内存不足错误

**症状：**
- 抛出 "Out of memory" 错误
- 系统内存使用率持续增长
- 实例自动崩溃

**解决方案：**

1. **限制实例数量：**
```javascript
const manager = new BrowserManager({
  maxInstances: 3,  // 根据系统内存调整
  maxPagesPerBrowser: 5
});
```

2. **内存优化配置：**
```javascript
const memoryOptimizedConfig = {
  mode: 'launchServer',  // 使用服务器模式减少内存占用
  options: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // 内存优化参数
      '--aggressive-cache-discard',
      '--max_old_space_size=1024',  // 限制内存使用
      '--memory-pressure-off',
      '--max-active-webgl-contexts=0',
      
      // 进程优化
      '--single-process',
      '--disable-background-timer-throttling'
    ]
  }
};
```

3. **自动内存监控：**
```javascript
class MemoryMonitor {
  constructor(manager) {
    this.manager = manager;
    this.memoryThreshold = 0.8; // 80% 内存使用率
  }

  startMonitoring() {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const usageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      if (usageRatio > this.memoryThreshold) {
        console.warn('High memory usage detected, cleaning up...');
        this.cleanupIdleInstances();
      }
    }, 30000);
  }

  async cleanupIdleInstances() {
    const instances = this.manager.getAllInstances();
    const now = Date.now();
    
    for (const instance of instances) {
      const idleTime = now - new Date(instance.lastActivity).getTime();
      if (idleTime > 300000) { // 5分钟无活动
        console.log(`Cleaning up idle instance: ${instance.id}`);
        await this.manager.stop(instance.id);
      }
    }
  }
}
```

### WebSocket 连接失败

**症状：**
- LaunchServer 模式连接失败
- 报错包含 "WebSocket error" 或 "Connection refused"
- 实例创建成功但无法创建页面

**解决方案：**

1. **检查端口占用：**
```javascript
// 使用特定端口便于诊断
await manager.launch('debug-instance', {
  mode: 'launchServer',
  options: {
    port: 9222  // 明确指定端口
  }
});
```

2. **网络配置检查：**
```javascript
// 诊断连接问题
async function diagnoseConnection(wsEndpoint) {
  const WebSocket = require('ws');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(wsEndpoint);
    
    ws.on('open', () => {
      console.log('✓ WebSocket connection successful');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      console.error('✗ WebSocket connection failed:', error.message);
      resolve(false);
    });
    
    setTimeout(() => {
      console.error('✗ WebSocket connection timeout');
      resolve(false);
    }, 5000);
  });
}
```

3. **防火墙和代理设置：**
```javascript
// 在代理环境下使用
const manager = new BrowserManager({
  options: {
    proxy: {
      server: 'http://proxy:8080',
      username: 'user',
      password: 'pass'
    }
  }
});
```

### 实例断开连接

**症状：**
- 实例状态变为 "disconnected"
- 页面操作抛出 "Target closed" 错误
- 健康检查失败

**解决方案：**

1. **自动恢复机制：**
```javascript
// 启用健康监控
const manager = new BrowserManager({
  healthCheckInterval: 30000,
  maxRetries: 3
});

// 监听断开事件
manager.on('instanceDisconnected', async (instanceId) => {
  console.log(`Instance ${instanceId} disconnected, attempting recovery...`);
  try {
    await manager.recoverInstance(instanceId);
    console.log(`Instance ${instanceId} recovered successfully`);
  } catch (error) {
    console.error(`Failed to recover instance ${instanceId}:`, error);
  }
});
```

2. **重试逻辑：**
```javascript
class RetryableBrowserOperations {
  constructor(manager) {
    this.manager = manager;
  }

  async withConnectionRetry(instanceId, operation, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (this.isConnectionError(error) && attempt < maxRetries) {
          console.warn(`Connection error on attempt ${attempt}, retrying...`);
          
          // 尝试恢复实例
          await this.manager.recoverInstance(instanceId);
          continue;
        }
        throw error;
      }
    }
  }

  isConnectionError(error) {
    const connectionErrors = [
      'Target closed',
      'Browser disconnected',
      'WebSocket is not open',
      'Session closed'
    ];
    
    return connectionErrors.some(msg => error.message.includes(msg));
  }
}
```

### 页面创建失败

**症状：**
- `newPage()` 方法抛出异常
- 页面创建时间过长
- 上下文创建失败

**解决方案：**

1. **资源限制检查：**
```javascript
// 检查实例状态 before 创建页面
async function safeNewPage(manager, instanceId, options = {}) {
  const instance = manager.getInstance(instanceId);
  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  if (instance.status !== 'running') {
    throw new Error(`Instance ${instanceId} is not running`);
  }

  // 检查资源使用
  if (instance.metrics.pagesCreated >= 10) {
    console.warn(`Instance ${instanceId} has many pages, consider creating new instance`);
  }

  return await manager.newPage(instanceId, options);
}
```

2. **上下文创建优化：**
```javascript
// 使用轻量级上下文
const lightContextOptions = {
  viewport: { width: 1024, height: 768 },
  ignoreHTTPSErrors: true,
  javaScriptEnabled: true,
  
  // 减少资源使用
  bypassCSP: true,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
};
```

### 内存泄漏

**症状：**
- 内存使用持续增长
- 实例数量不变但内存增加
- 需要定期重启服务

**解决方案：**

1. **定期清理：**
```javascript
class MemoryLeakPreventer {
  constructor(manager) {
    this.manager = manager;
    this.cleanupInterval = setInterval(() => {
      this.forceGarbageCollection();
    }, 60000); // 每分钟尝试GC
  }

  async forceGarbageCollection() {
    if (global.gc) {
      global.gc();
    }
  }

  async rotateInstances() {
    const instances = this.manager.getAllInstances();
    const now = Date.now();
    
    for (const instance of instances) {
      const uptime = now - new Date(instance.launchTime).getTime();
      
      // 每6小时轮换实例
      if (uptime > 21600000) {
        console.log(`Rotating instance: ${instance.id}`);
        await this.manager.stop(instance.id);
        
        // 重新启动
        await this.manager.launch(instance.id, instance.options);
      }
    }
  }
}
```

2. **上下文管理：**
```javascript
// 确保上下文正确关闭
async function withPage(manager, instanceId, operation) {
  let context, page;
  
  try {
    ({ context, page } = await manager.newPage(instanceId));
    return await operation(page);
  } finally {
    if (context) {
      await context.close().catch(error => {
        console.warn('Error closing context:', error);
      });
    }
  }
}
```

### CPU 使用率过高

**症状：**
- 系统 CPU 使用率持续高位
- 浏览器进程占用大量 CPU
- 响应变慢

**解决方案：**

1. **限制并发：**
```javascript
const manager = new BrowserManager({
  maxInstances: 2,  // 减少并发实例
  maxPagesPerBrowser: 3  // 减少每个实例的页面数
});
```

2. **CPU 优化配置：**
```javascript
const cpuOptimizedConfig = {
  options: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      
      // CPU 优化参数
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      
      // 功能禁用
      '--disable-extensions',
      '--disable-plugins',
      '--disable-translate',
      '--disable-background-networking'
    ]
  }
};
```

### 响应缓慢

**症状：**
- 页面操作响应时间长
- 导航超时
- 脚本执行缓慢

**解决方案：**

1. **性能监控：**
```javascript
class PerformanceMonitor {
  constructor(manager) {
    this.manager = manager;
    this.metrics = new Map();
  }

  async measureOperation(instanceId, operationName, operation) {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.recordMetric(instanceId, operationName, duration, true);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetric(instanceId, operationName, duration, false);
      throw error;
    }
  }

  recordMetric(instanceId, operationName, duration, success) {
    const key = `${instanceId}-${operationName}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        count: 0,
        totalDuration: 0,
        errors: 0
      });
    }
    
    const metric = this.metrics.get(key);
    metric.count++;
    metric.totalDuration += duration;
    
    if (!success) {
      metric.errors++;
    }
  }

  getPerformanceReport() {
    const report = {};
    
    for (const [key, metric] of this.metrics) {
      report[key] = {
        averageDuration: metric.totalDuration / metric.count,
        errorRate: metric.errors / metric.count,
        totalOperations: metric.count
      };
    }
    
    return report;
  }
}
```

2. **优化导航设置：**
```javascript
// 使用合适的等待策略
await page.goto(url, {
  waitUntil: 'domcontentloaded',  // 比 'load' 更快
  timeout: 15000
});

// 或者使用网络空闲检测
await page.goto(url, {
  waitUntil: 'networkidle',  // 500ms 内没有网络请求
  timeout: 30000
});
```

## 诊断工具

### 1. 健康检查脚本

```javascript
async function comprehensiveHealthCheck(manager) {
  const report = {
    timestamp: new Date().toISOString(),
    instances: {},
    system: {},
    issues: []
  };

  // 系统信息
  report.system.memory = process.memoryUsage();
  report.system.uptime = process.uptime();

  // 实例检查
  const instances = manager.getAllInstances();
  for (const instance of instances) {
    report.instances[instance.id] = {
      status: instance.status,
      uptime: Date.now() - new Date(instance.launchTime).getTime(),
      pages: instance.metrics.pagesCreated,
      errors: instance.metrics.errors
    };

    // 执行实例级健康检查
    try {
      const isHealthy = await performInstanceHealthCheck(manager, instance.id);
      if (!isHealthy) {
        report.issues.push(`Instance ${instance.id} is unhealthy`);
      }
    } catch (error) {
      report.issues.push(`Health check failed for ${instance.id}: ${error.message}`);
    }
  }

  return report;
}

async function performInstanceHealthCheck(manager, instanceId) {
  try {
    const { page, context } = await manager.newPage(instanceId);
    
    // 测试基本功能
    await page.goto('about:blank', { timeout: 10000 });
    const title = await page.title();
    
    await context.close();
    return title === '';
  } catch (error) {
    return false;
  }
}
```

### 2. 日志分析工具

```javascript
class LogAnalyzer {
  static analyzeErrors(logs) {
    const errorPatterns = {
      timeout: /timeout/i,
      memory: /memory|out of memory/i,
      connection: /connection|socket|websocket/i,
      browser: /browser|target|session/i,
      navigation: /navigation|page load/i
    };

    const analysis = {
      totalErrors: 0,
      byType: {},
      frequentMessages: {}
    };

    for (const log of logs) {
      if (log.level === 'error') {
        analysis.totalErrors++;
        
        // 分类错误类型
        for (const [type, pattern] of Object.entries(errorPatterns)) {
          if (pattern.test(log.message)) {
            analysis.byType[type] = (analysis.byType[type] || 0) + 1;
          }
        }

        // 统计频繁错误消息
        const key = log.message.substring(0, 100);
        analysis.frequentMessages[key] = (analysis.frequentMessages[key] || 0) + 1;
      }
    }

    return analysis;
  }
}
```

## 紧急恢复步骤

### 1. 服务重启流程

```javascript
async function emergencyRestart(manager) {
  console.log('Initiating emergency restart...');
  
  try {
    // 1. 停止所有实例
    await manager.stopAll();
    
    // 2. 等待清理完成
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
    
    // 4. 重新启动关键实例
    const criticalInstances = ['main-server', 'background-tasks'];
    for (const instanceId of criticalInstances) {
      await manager.launch(instanceId, {
        mode: 'launchServer',
        options: { timeout: 60000 }
      });
    }
    
    console.log('Emergency restart completed');
  } catch (error) {
    console.error('Emergency restart failed:', error);
    process.exit(1); // 严重错误，退出进程
  }
}
```

### 2. 资源紧急释放

```javascript
function emergencyCleanup() {
  // 清除所有定时器
  const timeouts = [];
  for (let i = 1; i < 99999; i++) {
    const timeout = window.setTimeout(() => {}, 0);
    if (timeout > i) {
      timeouts.push(timeout);
    }
  }
  
  timeouts.forEach(id => clearTimeout(id));
  
  // 清除所有间隔
  const intervals = [];
  for (let i = 1; i < 99999; i++) {
    const interval = window.setInterval(() => {}, 0);
    if (interval > i) {
      intervals.push(interval);
    }
  }
  
  intervals.forEach(id => clearInterval(id));
  
  console.log('Emergency cleanup completed');
}
```

这些故障排除指南应该能够帮助您诊断和解决大多数常见问题。如果问题仍然存在，请检查系统日志和浏览器控制台输出以获取更多详细信息。