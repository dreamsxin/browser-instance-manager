const WebSocket = require('ws');

class SearchClient {
  constructor(url = 'ws://localhost:8080') {
    this.ws = new WebSocket(url);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('已连接到搜索服务');
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.handleMessage(message);
    });

    this.ws.on('close', () => {
      console.log('连接已关闭');
    });

    this.ws.on('error', (error) => {
      console.error('连接错误:', error);
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'status':
        console.log(`[状态] ${message.message}`);
        break;
      case 'result':
        console.log(`\n=== 搜索结果: "${message.keyword}" ===`);
        console.log(`找到 ${message.total} 个结果:`);
        message.results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.title}`);
          console.log(`   链接: ${result.url}`);
          console.log(`   描述: ${result.description.substring(0, 100)}...`);
          console.log('---');
        });
        break;
      case 'error':
        console.error(`[错误] ${message.message}`);
        break;
      default:
        console.log('未知消息类型:', message);
    }
  }

  search(keyword) {
    if (this.ws.readyState === WebSocket.OPEN) {
      const task = {
        keyword: keyword,
        timestamp: Date.now()
      };
      this.ws.send(JSON.stringify(task));
      console.log(`已发送搜索请求: ${keyword}`);
    } else {
      console.log('连接未就绪，请稍后重试');
    }
  }
}

// 测试使用
if (require.main === module) {
  const client = new SearchClient();
  
  // 等待连接建立后发送测试请求
  setTimeout(() => {
    const testKeywords = ['Node.js', 'Playwright', 'WebSocket', '人工智能'];
    
    testKeywords.forEach((keyword, index) => {
      setTimeout(() => {
        client.search(keyword);
      }, index * 5000); // 每5秒发送一个请求，测试并发处理
    });
  }, 2000);
}

module.exports = SearchClient;