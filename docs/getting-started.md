# 快速开始指南

欢迎使用浏览器实例管理器！本指南将帮助您快速上手。

## 安装

### 使用 npm 安装

```bash
npm install browser-instance-manager
```

### 使用 yarn 安装

```bash
yarn add browser-instance-manager
```

### 系统要求

- Node.js 16.0 或更高版本
- 支持的操作系统：Windows, macOS, Linux
- 足够的系统内存（建议至少 2GB 可用内存）

## 基本用法

### 1. 导入和初始化

```javascript
import BrowserManager from 'browser-instance-manager';

// 创建管理器实例
const manager = new BrowserManager({
  maxInstances: 5,
  logLevel: 'info'
});
```

### 2. 启动浏览器实例

```javascript
// 使用 Launch 模式（适合短期任务）
const instance = await manager.launch('my-instance', {
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
});
```

### 3. 创建页面并执行操作

```javascript
// 创建新页面
const { page, context } = await manager.newPage('my-instance');

// 导航到网页
await page.goto('https://example.com');

// 执行操作
const title = await page.title();
console.log('页面标题:', title);

// 截图（可选）
await page.screenshot({ path: 'example.png' });

// 关闭上下文（重要！）
await context.close();
```

### 4. 停止实例和清理资源

```javascript
// 停止单个实例
await manager.stop('my-instance');

// 或者停止所有实例
await manager.stopAll();

// 关闭管理器
await manager.shutdown();
```

## 完整示例

```javascript
import BrowserManager from 'browser-instance-manager';

async function main() {
  const manager = new BrowserManager({
    maxInstances: 3,
    logLevel: 'info'
  });

  try {
    // 启动实例
    const instance = await manager.launch('example', {
      mode: 'launch',
      browser: 'chromium',
      options: {
        headless: true,
        viewport: { width: 1920, height: 1080 }
      }
    });

    console.log('实例启动成功:', instance.id);

    // 创建页面
    const { page, context } = await manager.newPage('example');

    // 导航到测试页面
    await page.goto('https://httpbin.org/user-agent');
    
    // 获取页面内容
    const content = await page.content();
    console.log('页面内容长度:', content.length);

    // 执行 JavaScript
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log('用户代理:', userAgent);

    // 清理资源
    await context.close();
    await manager.stop('example');

    console.log('任务完成！');

  } catch (error) {
    console.error('执行出错:', error);
  } finally {
    // 确保资源被清理
    await manager.shutdown();
  }
}

main();
```

## 使用预设配置

浏览器实例管理器提供了多种预设配置，方便快速开始：

```javascript
import BrowserManager, { getPreset } from 'browser-instance-manager';

const manager = new BrowserManager();

// 使用爬虫预设
const scrapingConfig = getPreset('scraping');
const instance = await manager.launch('scraper', scrapingConfig);

// 使用测试预设
const testingConfig = getPreset('testing');
const testInstance = await manager.launch('tester', testingConfig);
```

## 两种启动模式

### Launch 模式

适合短期、独立的浏览器任务：

```javascript
await manager.launch('quick-task', {
  mode: 'launch',
  options: {
    headless: true,
    timeout: 30000
  }
});
```

**特点：**
- 每次启动独立的浏览器进程
- 任务完成后立即释放资源
- 适合一次性任务和测试

### LaunchServer 模式

适合长期运行、需要复用浏览器的任务：

```javascript
await manager.launch('long-running', {
  mode: 'launchServer',
  options: {
    headless: true,
    port: 9222  // 可选端口
  }
});
```

**特点：**
- 启动浏览器服务器，通过 WebSocket 连接
- 多个页面共享同一个浏览器进程
- 适合爬虫、监控等长期任务

## 环境变量配置

您可以使用环境变量来配置管理器：

```bash
# 设置环境变量
export BROWSER_MANAGER_MAX_INSTANCES=10
export BROWSER_MANAGER_LOG_LEVEL=info
export BROWSER_HEADLESS=true

# 运行您的应用
node your-app.js
```

或者在 `.env` 文件中配置：

```env
BROWSER_MANAGER_MAX_INSTANCES=10
BROWSER_MANAGER_DEFAULT_BROWSER=chromium
BROWSER_MANAGER_LOG_LEVEL=info
BROWSER_MANAGER_TIMEOUT=30000
```

## 故障排除

### 常见问题

1. **浏览器启动失败**
   ```bash
   # 安装 Playwright 浏览器
   npx playwright install
   ```

2. **内存不足**
   ```javascript
   // 减少最大实例数
   const manager = new BrowserManager({
     maxInstances: 2
   });
   ```

3. **权限问题**
   ```bash
   # 在 Linux 上可能需要
   sudo sysctl -w kernel.unprivileged_userns_clone=1
   ```

### 调试模式

启用详细日志来诊断问题：

```javascript
const manager = new BrowserManager({
  logLevel: 'debug'
});
```

## 下一步

- 查看 [API 参考](api-reference.md) 了解所有可用方法
- 阅读 [配置说明](configuration.md) 了解高级配置选项
- 学习 [最佳实践](best-practices.md) 优化性能
- 了解 [模式对比](modes-comparison.md) 选择合适的启动模式

## 获取帮助

如果您遇到问题：

1. 查看 [故障排除指南](troubleshooting.md)
2. 检查 [示例代码](../src/examples/)
3. 在 GitHub 仓库提交 Issue

祝您使用愉快！🚀
```

## 53. docs/api-reference.md

```markdown
# API 参考

本文档详细介绍了浏览器实例管理器的所有 API 接口。

## BrowserManager 类

浏览器实例管理器的主类，负责创建、管理和销毁浏览器实例。

### 构造函数

```javascript
new BrowserManager(config?)
```

**参数：**
- `config` (Object, 可选) - 配置对象

**配置选项：**
```javascript
{
  // 实例限制
  maxInstances: 10,
  
  // 默认值
  defaultBrowser: 'chromium',
  defaultMode: 'launch',
  
  // 超时设置
  timeout: 30000,
  navigationTimeout: 30000,
  waitTimeout: 10000,
  
  // 日志配置
  logLevel: 'info', // 'error', 'warn', 'info', 'debug'
  logToFile: false,
  logFilePath: './logs/browser-manager.log',
  
  // 健康检查
  healthCheckInterval: 30000,
  
  // 性能配置
  maxPagesPerBrowser: 10
}
```

**示例：**
```javascript
const manager = new BrowserManager({
  maxInstances: 5,
  logLevel: 'info',
  timeout: 30000
});
```

### 实例方法

#### launch(instanceId, options)

启动一个新的浏览器实例。

```javascript
await manager.launch(instanceId, options)
```

**参数：**
- `instanceId` (string) - 实例的唯一标识符
- `options` (Object) - 启动选项
  - `mode` (string) - 启动模式：'launch' 或 'launchServer'
  - `browser` (string) - 浏览器类型：'chromium', 'firefox', 'webkit'
  - `options` (Object) - 浏览器特定选项

**返回值：**
- `Promise<Object>` - 实例信息对象

**示例：**
```javascript
const instance = await manager.launch('my-instance', {
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  }
});
```

#### stop(instanceId)

停止指定的浏览器实例。

```javascript
await manager.stop(instanceId)
```

**参数：**
- `instanceId` (string) - 要停止的实例ID

**返回值：**
- `Promise<boolean>` - 成功停止返回 true

**示例：**
```javascript
await manager.stop('my-instance');
```

#### stopAll()

停止所有浏览器实例。

```javascript
await manager.stopAll()
```

**返回值：**
- `Promise<void>`

**示例：**
```javascript
await manager.stopAll();
```

#### newPage(instanceId, contextOptions?)

在指定实例中创建新页面。

```javascript
await manager.newPage(instanceId, contextOptions?)
```

**参数：**
- `instanceId` (string) - 实例ID
- `contextOptions` (Object, 可选) - 页面上下文选项

**返回值：**
- `Promise<Object>` - 包含 page 和 context 的对象
  - `page` (Playwright.Page) - 页面对象
  - `context` (Playwright.BrowserContext) - 上下文对象

**示例：**
```javascript
const { page, context } = await manager.newPage('my-instance', {
  viewport: { width: 1920, height: 1080 },
  userAgent: 'My Custom User Agent',
  ignoreHTTPSErrors: true
});

// 使用页面
await page.goto('https://example.com');

// 完成后关闭上下文
await context.close();
```

#### getInstance(instanceId)

获取指定实例的信息。

```javascript
manager.getInstance(instanceId)
```

**参数：**
- `instanceId` (string) - 实例ID

**返回值：**
- `Object|null` - 实例信息对象，如果不存在返回 null

**示例：**
```javascript
const instance = manager.getInstance('my-instance');
if (instance) {
  console.log('实例状态:', instance.status);
  console.log('启动时间:', instance.launchTime);
}
```

#### getAllInstances()

获取所有实例的信息。

```javascript
manager.getAllInstances()
```

**返回值：**
- `Array<Object>` - 实例信息数组

**示例：**
```javascript
const instances = manager.getAllInstances();
instances.forEach(instance => {
  console.log(`${instance.id}: ${instance.status}`);
});
```

#### getStatus()

获取管理器状态。

```javascript
manager.getStatus()
```

**返回值：**
- `Object` - 状态对象
  - `totalInstances` (number) - 总实例数
  - `runningInstances` (number) - 运行中的实例数
  - `maxInstances` (number) - 最大实例数
  - `health` (string) - 健康状态

**示例：**
```javascript
const status = manager.getStatus();
console.log(`运行中: ${status.runningInstances}/${status.totalInstances}`);
```

#### shutdown()

关闭管理器，停止所有实例并清理资源。

```javascript
await manager.shutdown()
```

**返回值：**
- `Promise<void>`

**示例：**
```javascript
// 应用退出时调用
process.on('SIGINT', async () => {
  await manager.shutdown();
  process.exit(0);
});
```

### 事件

BrowserManager 继承自 EventEmitter，可以监听以下事件：

#### instanceCreated

实例创建时触发。

```javascript
manager.on('instanceCreated', (instanceId) => {
  console.log(`实例已创建: ${instanceId}`);
});
```

#### instanceStopped

实例停止时触发。

```javascript
manager.on('instanceStopped', (instanceId) => {
  console.log(`实例已停止: ${instanceId}`);
});
```

#### instanceError

实例发生错误时触发。

```javascript
manager.on('instanceError', (instanceId, error) => {
  console.error(`实例 ${instanceId} 错误:`, error);
});
```

#### instanceDisconnected

实例断开连接时触发。

```javascript
manager.on('instanceDisconnected', (instanceId) => {
  console.warn(`实例断开连接: ${instanceId}`);
});
```

## 预设配置函数

### getPreset(presetName, customOptions?)

获取预设配置。

```javascript
import { getPreset } from 'browser-instance-manager';

const config = getPreset('scraping', {
  options: {
    viewport: { width: 1366, height: 768 }
  }
});
```

**参数：**
- `presetName` (string) - 预设名称
- `customOptions` (Object, 可选) - 自定义选项

**可用预设：**
- `scraping` - 网页抓取配置
- `testing` - 测试环境配置  
- `production` - 生产环境配置
- `mobile` - 移动端配置
- `performance` - 性能测试配置
- `headless_minimal` - 最小资源占用配置

### getAvailablePresets()

获取所有可用的预设名称。

```javascript
import { getAvailablePresets } from 'browser-instance-manager';

const presets = getAvailablePresets();
console.log('可用预设:', presets);
// ['scraping', 'testing', 'production', 'mobile', 'performance', 'headless_minimal']
```

## 工具函数

### createLogger(options?)

创建日志记录器实例。

```javascript
import { createLogger } from 'browser-instance-manager';

const logger = createLogger({
  level: 'info',
  logToFile: true,
  logFilePath: './app.log'
});

logger.info('应用启动');
```

### getMetricsCollector()

获取全局指标收集器。

```javascript
import { getMetricsCollector } from 'browser-instance-manager';

const metrics = getMetricsCollector();

// 记录自定义指标
metrics.record('my-instance', 'customMetric', 42);

// 获取汇总报告
const summary = metrics.getSummary();
console.log('总页面创建:', summary.totalPagesCreated);
```

## 错误类型

浏览器实例管理器使用自定义错误类型，便于错误处理：

```javascript
import { 
  BrowserInstanceError,
  ConnectionError, 
  TimeoutError,
  ValidationError 
} from 'browser-instance-manager';

try {
  await manager.launch('test', options);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('配置验证失败:', error.message);
  } else if (error instanceof ConnectionError) {
    console.error('连接错误:', error.message);
  } else if (error instanceof BrowserInstanceError) {
    console.error('浏览器实例错误:', error.message);
  }
}
```

### 可用错误类型

- `BrowserInstanceError` - 浏览器实例相关错误
- `ConnectionError` - 连接相关错误
- `TimeoutError` - 超时错误
- `ValidationError` - 验证错误
- `ResourceExhaustedError` - 资源耗尽错误
- `LaunchError` - 启动错误
- `HealthCheckError` - 健康检查错误

## 类型定义

### InstanceInfo

实例信息对象的结构：

```typescript
interface InstanceInfo {
  id: string;
  browser: Playwright.Browser;
  mode: BaseMode;
  browserType: string;
  status: 'running' | 'stopped' | 'error' | 'disconnected';
  launchTime: Date;
  lastActivity: Date;
  options: Object;
  metrics: {
    pagesCreated: number;
    requestsMade: number;
    errors: number;
  };
}
```

### LaunchOptions

启动选项的结构：

```typescript
interface LaunchOptions {
  mode?: 'launch' | 'launchServer';
  browser?: 'chromium' | 'firefox' | 'webkit';
  options?: {
    headless?: boolean;
    args?: string[];
    viewport?: { width: number; height: number };
    timeout?: number;
    userAgent?: string;
    ignoreHTTPSErrors?: boolean;
    // ... 其他 Playwright 选项
  };
}
```

## 浏览器兼容性

支持的浏览器：
- ✅ Chromium (推荐)
- ✅ Firefox
- ✅ WebKit (Safari)

支持的启动模式：
- ✅ Launch 模式
- ✅ LaunchServer 模式

## 版本信息

当前版本支持的功能：
- ✅ 实例生命周期管理
- ✅ 两种启动模式
- ✅ 健康监控和自动恢复
- ✅ 性能指标收集
- ✅ 预设配置
- ✅ 完整类型定义
- ✅ 单元测试和集成测试

---

**注意：** 本文档基于最新版本编写，具体 API 可能随版本更新而变化。请参考您使用的版本的文档。