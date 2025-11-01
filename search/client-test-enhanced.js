const WebSocket = require('ws');

class EnhancedSearchClient {
  constructor(url = 'ws://localhost:8080') {
    this.ws = new WebSocket(url);
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('已连接到增强版搜索服务');
      console.log('服务包含页面保活机制，页面会定期自动执行模拟搜索');
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
    const timestamp = new Date().toLocaleTimeString();
    
    switch (message.type) {
      case 'status':
        console.log(`[${timestamp}] [状态] ${message.message}`);
        break;
      case 'result':
        console.log(`\n[${timestamp}] === 搜索结果: "${message.keyword}" ===`);
        console.log(`找到 ${message.total} 个结果:`);
        message.results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.title}`);
          console.log(`   链接: ${result.url}`);
          if (result.description) {
            console.log(`   描述: ${result.description.substring(0, 100)}...`);
          }
          console.log('---');
        });
        break;
      case 'error':
        console.error(`[${timestamp}] [错误] ${message.message}`);
        break;
      default:
        console.log(`[${timestamp}] 未知消息类型:`, message);
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

  // 测试保活机制观察
  monitorKeepAlive(duration = 300000) { // 默认监控5分钟
    console.log(`开始监控保活机制，将持续 ${duration/1000/60} 分钟...`);
    console.log('观察控制台输出，可以看到页面自动执行的保活搜索');
    
    setTimeout(() => {
      console.log('监控结束');
    }, duration);
  }
}

// 测试使用
if (require.main === module) {
  const client = new EnhancedSearchClient();
  
  // 等待连接建立后发送测试请求
  setTimeout(() => {
    const testKeywords = [
      'Node.js Playwright', 
      'WebSocket 实时通信', 
      '人工智能发展趋势',
      '机器学习应用场景',
      '云计算技术架构'
    ];
    
    // 发送测试搜索请求
    testKeywords.forEach((keyword, index) => {
      setTimeout(() => {
        client.search(keyword);
      }, index * 10000); // 每10秒发送一个请求
    });

    // 启动保活机制监控
    client.monitorKeepAlive(10 * 60 * 1000); // 监控10分钟
    
  }, 2000);
}

module.exports = EnhancedSearchClient;