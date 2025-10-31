# Browser Instance Manager

基于 Playwright 的浏览器实例管理器，支持快速启动、停止和两种启动模式（launch 和 launchServer）。

## 特性

- 🚀 **快速启动**: 支持两种启动模式，满足不同场景需求
- 🔄 **实例管理**: 完整的浏览器实例生命周期管理
- 📊 **健康监控**: 自动健康检查和实例恢复
- 📈 **性能监控**: 详细的性能指标和统计信息
- 🛡️ **错误处理**: 完善的错误处理和重试机制
- 🔧 **可配置**: 丰富的配置选项和预设配置
- 📚 **类型安全**: 完整的 TypeScript 类型定义

## 安装

```bash
npm install browser-instance-manager
```

## 快速开始

### 基础使用

```javascript
import BrowserManager from 'browser-instance-manager';

// 创建管理器实例
const manager = new BrowserManager({
  maxInstances: 5,
  logLevel: 'info'
});

async function example() {
  try {
    // 启动浏览器实例
    const instance = await manager.launch('my-instance', {
      mode: 'launch',
      browser: 'chromium',
      options: {
        headless: true,
        viewport: { width: 1920, height: 1080 }
      }
    });

    // 创建页面
    const { page, context } = await manager.newPage('my-instance');
    await page.goto('https://example.com');
    console.log(await page.title());

    // 清理资源
    await context.close();
    await manager.stop('my-instance');
    
  } finally {
    await manager.shutdown();
  }
}

example();
```

### 使用预设配置

```javascript
import BrowserManager, { getPreset } from 'browser-instance-manager';

const manager = new BrowserManager();

async function scrapingExample() {
  // 使用爬虫预设配置
  const scrapingConfig = getPreset('scraping');
  const instance = await manager.launch('scraper', scrapingConfig);

  const { page } = await manager.newPage('scraper');
  await page.goto('https://httpbin.org/user-agent');
  
  // ... 执行爬虫任务
  
  await manager.stop('scraper');
}
```

## 启动模式

### Launch 模式

适合短期任务，每次启动独立的浏览器进程：
```javascript
await manager.launch('quick-task', {
  mode: 'launch',
  options: {
    headless: true,
    timeout: 30000
  }
});
```

### LaunchServer 模式

适合长期运行任务，启动浏览器服务器并通过 WebSocket 连接：
```javascript
await manager.launch('long-running', {
  mode: 'launchServer',
  options: {
    headless: true,
    port: 9222  // 可选，指定端口
  }
});
```

## 配置选项

### 管理器配置

```javascript
const config = {
  // 实例限制
  maxInstances: 10,
  
  // 超时设置
  timeout: 30000,
  navigationTimeout: 30000,
  
  // 日志配置
  logLevel: 'info', // 'error', 'warn', 'info', 'debug'
  logToFile: false,
  
  // 健康检查
  healthCheckInterval: 30000,
  
  // 性能配置
  maxPagesPerBrowser: 10
};
```

### 浏览器配置

```javascript
const browserOptions = {
  // 通用选项
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1920, height: 1080 },
  
  // 浏览器特定选项
  firefoxUserPrefs: {
    'dom.webnotifications.enabled': false
  }
};
```


## API 参考

### BrowserManager

主要管理类，负责浏览器实例的创建、管理和销毁。

#### 方法

- `launch(instanceId, options)`: 启动浏览器实例
- `stop(instanceId)`: 停止浏览器实例
- `stopAll()`: 停止所有实例
- `newPage(instanceId, contextOptions)`: 创建新页面
- `getInstance(instanceId)`: 获取实例信息
- `getAllInstances()`: 获取所有实例
- `getStatus()`: 获取管理器状态
- `shutdown()`: 关闭管理器

### 预设配置

- `SCRAPING`: 网页抓取配置
- `TESTING`: 测试环境配置
- `PRODUCTION`: 生产环境配置
- `MOBILE`: 移动端配置
- `PERFORMANCE`: 性能测试配置
- `HEADLESS_MINIMAL`: 最小资源占用配置

## 性能建议

1. **短期任务**: 使用 `launch` 模式，任务完成后立即释放资源
2. **长期任务**: 使用 `launchServer` 模式，复用浏览器实例
3. **高并发**: 合理设置 `maxInstances`，避免资源耗尽
4. **内存优化**: 及时关闭不再使用的页面和上下文

## 故障排除

### 常见问题

1. **浏览器启动失败**
   - 检查 Playwright 浏览器是否已安装: `npx playwright install`
   - 检查系统依赖是否完整

2. **内存泄漏**
   - 确保及时调用 `context.close()`
   - 监控实例数量，避免无限增长

3. **连接超时**
   - 调整 `timeout` 配置
   - 检查网络连接和代理设置

### 调试模式

```javascript
const manager = new BrowserManager({
  logLevel: 'debug'
});
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
```
