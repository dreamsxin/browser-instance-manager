# 配置说明

本文档详细介绍了浏览器实例管理器的所有配置选项。

## 配置层次结构

浏览器实例管理器支持多层次的配置，优先级从高到低：

1. **方法参数** - 在调用方法时传递的选项
2. **环境变量** - 系统环境变量
3. **管理器配置** - 创建管理器时的配置
4. **默认配置** - 内置的默认值

## 管理器配置

创建 BrowserManager 实例时可以传递的配置选项：

### 基本配置

```javascript
const manager = new BrowserManager({
  // 实例限制
  maxInstances: 10,
  
  // 默认值
  defaultBrowser: 'chromium',
  defaultMode: 'launch',
  
  // 超时设置（毫秒）
  timeout: 30000,
  navigationTimeout: 30000,
  waitTimeout: 10000,
  
  // 日志配置
  logLevel: 'info',
  logToFile: false,
  logFilePath: './logs/browser-manager.log'
});
```

### 高级配置

```javascript
const manager = new BrowserManager({
  // 健康检查配置
  healthCheckInterval: 30000,
  healthCheckTimeout: 5000,
  
  // 重试配置
  maxRetries: 3,
  retryDelay: 1000,
  
  // 性能配置
  maxPagesPerBrowser: 10,
  memoryLimit: 1024, // MB
  
  // 安全配置
  blockThirdPartyCookies: true,
  blockImages: false,
  javaScriptEnabled: true,
  
  // 视图配置
  defaultViewport: {
    width: 1920,
    height: 1080
  },
  
  // 用户代理
  userAgent: null
});
```

## 环境变量配置

您可以使用环境变量来配置管理器，这在 Docker 容器和云环境中特别有用：

### 基本环境变量

```bash
# 实例限制
export BROWSER_MANAGER_MAX_INSTANCES=10

# 默认值
export BROWSER_MANAGER_DEFAULT_BROWSER=chromium
export BROWSER_MANAGER_DEFAULT_MODE=launch

# 超时设置
export BROWSER_MANAGER_TIMEOUT=30000
export BROWSER_MANAGER_NAVIGATION_TIMEOUT=30000
export BROWSER_MANAGER_WAIT_TIMEOUT=10000
```

### 日志和环境配置

```bash
# 日志配置
export BROWSER_MANAGER_LOG_LEVEL=info
export BROWSER_MANAGER_LOG_TO_FILE=false
export BROWSER_MANAGER_LOG_FILE_PATH=./logs/browser-manager.log

# 环境标识
export NODE_ENV=production
```

### 性能配置

```bash
# 健康检查
export BROWSER_MANAGER_HEALTH_CHECK_INTERVAL=30000
export BROWSER_MANAGER_HEALTH_CHECK_TIMEOUT=5000

# 重试配置
export BROWSER_MANAGER_MAX_RETRIES=3
export BROWSER_MANAGER_RETRY_DELAY=1000

# 资源限制
export BROWSER_MANAGER_MAX_PAGES_PER_BROWSER=10
export BROWSER_MANAGER_MEMORY_LIMIT=1024
```

## 启动选项配置

在调用 `launch()` 方法时可以传递的选项：

### 基本启动选项

```javascript
await manager.launch('my-instance', {
  // 启动模式
  mode: 'launch', // 或 'launchServer'
  
  // 浏览器类型
  browser: 'chromium', // 或 'firefox', 'webkit'
  
  // 浏览器选项
  options: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  }
});
```

### 浏览器特定选项

#### Chromium 选项

```javascript
{
  mode: 'launch',
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
      '--disable-gpu'
    ],
    ignoreDefaultArgs: ['--disable-extensions']
  }
}
```

#### Firefox 选项

```javascript
{
  mode: 'launch',
  browser: 'firefox',
  options: {
    headless: true,
    args: [
      '-wait-for-browser',
      '-no-remote',
      '-new-instance'
    ],
    firefoxUserPrefs: {
      'dom.webnotifications.enabled': false,
      'media.volume_scale': '0.0'
    }
  }
}
```

#### WebKit 选项

```javascript
{
  mode: 'launch',
  browser: 'webkit',
  options: {
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  }
}
```

## 上下文选项配置

在创建页面时可以传递的上下文选项：

```javascript
const { page, context } = await manager.newPage('my-instance', {
  // 视图端口
  viewport: { width: 1920, height: 1080 },
  
  // 用户代理
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  
  // 地理位置模拟
  geolocation: {
    latitude: 40.7128,
    longitude: -74.0060
  },
  
  // 权限
  permissions: ['geolocation'],
  
  // HTTP 设置
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    'X-Custom-Header': 'value'
  },
  
  // 资源控制
  javaScriptEnabled: true,
  blockImages: false,
  
  // 颜色方案
  colorScheme: 'dark', // 'light', 'dark', 'no-preference'
  
  // 时区
  timezoneId: 'America/New_York'
});
```

## 预设配置

浏览器实例管理器提供了多种预设配置：

### 使用预设

```javascript
import { getPreset } from 'browser-instance-manager';

// 获取爬虫预设
const scrapingConfig = getPreset('scraping');

// 自定义预设
const customConfig = getPreset('scraping', {
  options: {
    viewport: { width: 1366, height: 768 }
  },
  contextOptions: {
    userAgent: 'My Custom Scraper'
  }
});

await manager.launch('scraper', customConfig);
```

### 可用预设详情

#### 1. 爬虫预设 (scraping)

适合网页抓取和数据提取：

```javascript
{
  mode: 'launchServer',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=TranslateUI',
      '--aggressive-cache-discard',
      '--max_old_space_size=4096'
    ],
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
}
```

#### 2. 测试预设 (testing)

适合自动化测试：

```javascript
{
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: process.env.CI ? true : false,
    devtools: !process.env.CI,
    slowMo: process.env.CI ? 0 : 50,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content'
    ],
    viewport: { width: 1280, height: 720 }
  }
}
```

#### 3. 生产环境预设 (production)

适合生产环境部署：

```javascript
{
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
      '--aggressive-cache-discard',
      '--max_old_space_size=4096'
    ],
    timeout: 60000
  }
}
```

#### 4. 移动端预设 (mobile)

适合移动端测试和模拟：

```javascript
{
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: true,
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  }
}
```

#### 5. 性能测试预设 (performance)

适合性能测试和基准测试：

```javascript
{
  mode: 'launchServer',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--aggressive-cache-discard',
      '--max_old_space_size=8192',
      '--memory-pressure-off'
    ],
    timeout: 120000
  }
}
```

#### 6. 最小资源预设 (headless_minimal)

适合资源受限环境：

```javascript
{
  mode: 'launch',
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
      '--disable-extensions',
      '--disable-plugins',
      '--disable-translate',
      '--disable-background-networking',
      '--mute-audio'
    ],
    viewport: { width: 1366, height: 768 }
  }
}
```

## 配置验证

浏览器实例管理器会自动验证配置，如果配置无效会抛出 `ValidationError`：

```javascript
try {
  const manager = new BrowserManager({
    maxInstances: -1, // 无效值
    defaultBrowser: 'invalid-browser' // 无效浏览器类型
  });
} catch (error) {
  console.error('配置验证失败:', error.message);
  // 输出: "Configuration validation failed: maxInstances must be a positive number, Invalid default browser: invalid-browser"
}
```

### 验证规则

- `maxInstances` - 必须为正整数，1-100
- `defaultBrowser` - 必须是 'chromium', 'firefox', 或 'webkit'
- `defaultMode` - 必须是 'launch' 或 'launchServer'
- `timeout` - 必须为数字，1000-300000
- `logLevel` - 必须是 'error', 'warn', 'info', 'debug'
- `viewport` - 宽度和高度必须为 100-4096

## 配置最佳实践

### 开发环境配置

```javascript
const devConfig = {
  maxInstances: 3,
  logLevel: 'debug',
  defaultMode: 'launch',
  healthCheckInterval: 15000
};
```

### 生产环境配置

```javascript
const prodConfig = {
  maxInstances: 10,
  logLevel: 'warn',
  defaultMode: 'launchServer',
  healthCheckInterval: 30000,
  timeout: 60000
};
```

### Docker 环境配置

```dockerfile
# 在 Dockerfile 中设置环境变量
ENV BROWSER_MANAGER_MAX_INSTANCES=5
ENV BROWSER_MANAGER_LOG_LEVEL=info
ENV BROWSER_HEADLESS=true
ENV BROWSER_MANAGER_TIMEOUT=60000
```

### 性能优化配置

```javascript
const perfConfig = {
  maxInstances: 5,
  maxPagesPerBrowser: 5,
  memoryLimit: 2048, // 2GB
  healthCheckInterval: 30000,
  defaultMode: 'launchServer' // 长期任务使用服务器模式
};
```

## 配置示例

### 完整的生产配置示例

```javascript
import BrowserManager from 'browser-instance-manager';

const manager = new BrowserManager({
  // 资源限制
  maxInstances: 8,
  maxPagesPerBrowser: 8,
  memoryLimit: 2048,
  
  // 默认值
  defaultBrowser: 'chromium',
  defaultMode: 'launchServer',
  
  // 超时设置
  timeout: 60000,
  navigationTimeout: 45000,
  waitTimeout: 15000,
  
  // 日志配置
  logLevel: 'warn',
  logToFile: true,
  logFilePath: '/var/log/browser-manager.log',
  
  // 健康检查
  healthCheckInterval: 30000,
  healthCheckTimeout: 10000,
  
  // 重试配置
  maxRetries: 3,
  retryDelay: 2000,
  
  // 安全配置
  blockThirdPartyCookies: true,
  javaScriptEnabled: true
});

export default manager;
```

### 开发环境配置示例

```javascript
import BrowserManager from 'browser-instance-manager';

const manager = new BrowserManager({
  maxInstances: 2,
  logLevel: 'debug',
  defaultMode: 'launch',
  healthCheckInterval: 15000,
  timeout: 30000
});

// 开发时使用测试预设
export async function createTestInstance() {
  const { getPreset } = await import('browser-instance-manager');
  const testingConfig = getPreset('testing');
  return await manager.launch('test', testingConfig);
}

export default manager;
```

通过合理配置，您可以优化浏览器实例管理器的性能、稳定性和资源使用效率。