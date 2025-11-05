# Playwright Web Scraper

高性能的Node.js网页抓取服务，使用Playwright并支持并发控制。

## 特性

- 🚀 基于Playwright的现代网页抓取
- 🔒 内置并发控制，防止资源耗尽
- 📦 支持单URL和批量抓取
- 🛡️ 安全中间件（Helmet、CORS）
- ⚡ 性能优化（资源拦截、连接复用）
- 🔧 可配置的并发限制和超时设置

## 快速开始

### 安装依赖

```bash
npm install
npx playwright install chromium
```

### 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 环境变量

```bash
PORT=3000  # 服务端口，默认3000
```

## API 文档

### 健康检查
```http
GET /health
```

### 单页面抓取
```http
POST /scrape
Content-Type: application/json

{
  "url": "https://example.com",
  "timeout": 30000,
  "waitUntil": "domcontentloaded"
}
```

### 批量抓取
```http
POST /scrape/batch
Content-Type: application/json

{
  "urls": [
    "https://example.com/1",
    "https://example.com/2"
  ],
  "timeout": 30000
}
```

### 并发控制管理
```http
GET /concurrency
PUT /concurrency

{
  "maxConcurrent": 5
}
```

## 使用示例

```javascript
// 单页面抓取
const response = await fetch('http://localhost:3000/scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com'
  })
});

const result = await response.json();
console.log(result.content);
```

## 配置说明

- **默认并发数**: 3
- **默认超时**: 30秒
- **支持的最大批量URL**: 10个
- **支持的并发数范围**: 1-10
```

## 安装和运行

```bash
# 创建项目目录
mkdir web-scraper && cd web-scraper

# 复制上面的文件到对应位置

# 安装依赖
npm install

# 安装Playwright浏览器
npx playwright install chromium

# 启动服务
npm start
```

## 使用示例

```bash
# 健康检查
curl http://localhost:3000/health

# 单页面抓取
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 查看并发状态
curl http://localhost:3000/concurrency

# 修改并发限制
curl -X PUT http://localhost:3000/concurrency \
  -H "Content-Type: application/json" \
  -d '{"maxConcurrent": 5}'
```

## 并发测试

### 1. 基础并发测试
```bash
node test-client.js concurrency
```

### 2. 压力测试
```bash
node test-client.js stress
```

### 3. 自定义测试
```bash
# 并发数5，总请求数20
node test-client.js custom 5 20
```

### 4. 作为模块使用
```javascript
const ConcurrencyTestClient = require('./test-client');

async function runTest() {
  const client = new ConcurrencyTestClient();
  
  // 设置并发限制
  await client.setConcurrency(4);
  
  // 运行测试
  const report = await client.runConcurrencyTest({
    concurrency: 4,
    totalRequests: 40,
    delayBetweenBatches: 200
  });
  
  console.log('测试完成:', report);
}

runTest();
```
