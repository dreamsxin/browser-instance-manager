# 启动模式对比指南

## 概述

浏览器实例管理器支持两种启动模式：`launch`（直接启动）和 `launchServer`（服务器启动）。本文档详细比较两种模式的特性、适用场景和性能表现。

## 模式对比表

| 特性 | Launch 模式 | LaunchServer 模式 |
|------|-------------|-------------------|
| **启动速度** | 较慢（每次启动新进程） | 快速（复用现有进程） |
| **资源占用** | 较高（每个实例独立进程） | 较低（共享进程） |
| **内存使用** | 每个实例独立内存空间 | 共享内存，更高效 |
| **隔离性** | 完全隔离 | 部分隔离（共享进程） |
| **稳定性** | 一个实例崩溃不影响其他 | 服务器崩溃影响所有连接 |
| **扩展性** | 水平扩展 | 垂直扩展 |
| **网络连接** | 直接连接 | WebSocket 连接 |
| **适用场景** | 短期任务、测试 | 长期运行、高并发 |

## 详细技术对比

### Launch 模式

**工作原理：**
- 直接启动浏览器进程
- 每个实例拥有独立的进程和内存空间
- 实例间完全隔离

**优势：**
- ✅ 完全隔离，一个实例崩溃不影响其他
- ✅ 安全性更高，实例间无资源共享
- ✅ 调试方便，可以开启 devtools
- ✅ 适合需要独立环境的任务

**劣势：**
- ❌ 启动速度慢（2-5秒）
- ❌ 内存占用高（每个实例 100-300MB）
- ❌ 创建大量实例时系统负载高

**代码示例：**
```javascript
const manager = new BrowserManager();

// 启动 Launch 模式实例
const instance = await manager.launch('task-1', {
  mode: 'launch',
  browser: 'chromium',
  headless: true,
  devtools: false
});
```

### LaunchServer 模式

**工作原理：**
- 启动浏览器服务器进程
- 通过 WebSocket 连接复用同一个浏览器实例
- 多个页面共享同一个进程

**优势：**
- ✅ 启动速度快（100-500ms）
- ✅ 内存使用高效
- ✅ 支持高并发页面创建
- ✅ 适合长期运行任务

**劣势：**
- ❌ 服务器崩溃会影响所有连接
- ❌ 实例间存在资源共享
- ❌ 调试相对复杂

**代码示例：**
```javascript
const manager = new BrowserManager();

// 启动 LaunchServer 模式实例
const instance = await manager.launch('server-instance', {
  mode: 'launchServer',
  browser: 'chromium',
  headless: true,
  port: 9222  // 可选，指定端口
});
```

## 性能基准测试

### 启动时间对比

| 操作 | Launch 模式 | LaunchServer 模式 |
|------|-------------|-------------------|
| 首次启动 | 2-5 秒 | 2-5 秒 |
| 后续启动 | 2-5 秒 | 100-500 毫秒 |
| 创建页面 | 50-200 毫秒 | 20-50 毫秒 |

### 内存使用对比

| 场景 | Launch 模式 | LaunchServer 模式 |
|------|-------------|-------------------|
| 单个实例 | 100-300 MB | 100-300 MB |
| 5个实例 | 500-1500 MB | 300-500 MB |
| 10个实例 | 1000-3000 MB | 400-700 MB |

### 并发能力

| 指标 | Launch 模式 | LaunchServer 模式 |
|------|-------------|-------------------|
| 最大实例数 | 受内存限制 | 受连接数限制 |
| 页面创建速度 | 中等 | 快速 |
| 系统负载 | 较高 | 中等 |

## 选择指南

### 使用 Launch 模式的情况

**推荐场景：**
- 🎯 **单元测试** - 需要完全隔离的测试环境
- 🎯 **调试开发** - 需要开启 devtools 进行调试
- 🎯 **敏感任务** - 处理敏感数据，需要完全隔离
- 🎯 **短期任务** - 运行时间短的独立任务
- 🎯 **故障排查** - 需要独立的日志和错误信息

**配置示例：**
```javascript
const testingPreset = {
  mode: 'launch',
  browser: 'chromium',
  options: {
    headless: false,  // 可视化调试
    devtools: true,   // 开启开发者工具
    slowMo: 100,      // 慢动作，便于观察
    timeout: 30000
  }
};
```

### 使用 LaunchServer 模式的情况

**推荐场景：**
- 🚀 **网页抓取** - 高并发爬虫任务
- 🚀 **监控服务** - 长期运行的页面监控
- 🚀 **性能测试** - 需要快速创建大量页面
- 🚀 **API 服务** - 作为后端服务提供浏览器功能
- 🚀 **资源优化** - 在资源受限的环境中运行

**配置示例：**
```javascript
const scrapingPreset = {
  mode: 'launchServer',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ],
    timeout: 60000
  }
};
```

## 混合使用策略

### 场景：既有短期任务又有长期服务

```javascript
class HybridBrowserManager {
  constructor() {
    this.manager = new BrowserManager();
    this.launchInstances = new Map();    // 短期任务实例
    this.serverInstances = new Map();    // 长期服务实例
  }

  async startServerInstance(instanceId, options = {}) {
    const instance = await this.manager.launch(instanceId, {
      mode: 'launchServer',
      ...options
    });
    this.serverInstances.set(instanceId, instance);
    return instance;
  }

  async startTaskInstance(instanceId, options = {}) {
    const instance = await this.manager.launch(instanceId, {
      mode: 'launch',
      ...options
    });
    this.launchInstances.set(instanceId, instance);
    
    // 设置自动清理
    setTimeout(() => {
      this.cleanupTaskInstance(instanceId);
    }, options.autoCleanup || 300000); // 5分钟后自动清理
    
    return instance;
  }

  async cleanupTaskInstance(instanceId) {
    if (this.launchInstances.has(instanceId)) {
      await this.manager.stop(instanceId);
      this.launchInstances.delete(instanceId);
    }
  }
}
```

## 最佳配置参数

### Launch 模式优化配置

```javascript
const optimizedLaunchConfig = {
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
      '--single-process',  // 单进程模式，减少内存
      '--memory-pressure-off'  // 禁用内存压力处理
    ],
    timeout: 15000  // 缩短超时时间
  }
};
```

### LaunchServer 模式优化配置

```javascript
const optimizedServerConfig = {
  mode: 'launchServer',
  browser: 'chromium',
  options: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--aggressive-cache-discard',
      '--max_old_space_size=4096',
      '--disable-background-timer-throttling'
    ],
    timeout: 30000,
    port: 9222  // 固定端口，便于管理
  }
};
```

## 故障转移策略

### 双模式备份

```javascript
class FallbackBrowserManager {
  constructor() {
    this.primaryMode = 'launchServer';
    this.fallbackMode = 'launch';
  }

  async launchWithFallback(instanceId, options) {
    try {
      // 首先尝试主模式
      return await this.manager.launch(instanceId, {
        mode: this.primaryMode,
        ...options
      });
    } catch (error) {
      console.warn(`Primary mode failed, falling back to ${this.fallbackMode}:`, error);
      
      // 主模式失败时使用备用模式
      return await this.manager.launch(instanceId, {
        mode: this.fallbackMode,
        ...options
      });
    }
  }
}
```

## 监控和指标

### 关键监控指标

```javascript
// 监控两种模式的性能指标
const metrics = {
  launch: {
    startupTime: 'histogram',
    memoryUsage: 'gauge',
    instanceCount: 'counter'
  },
  launchServer: {
    connectionCount: 'gauge',
    wsMessages: 'counter',
    serverUptime: 'gauge'
  }
};
```

通过理解两种模式的特性并根据具体需求选择合适的模式，可以显著提升应用的性能和稳定性。