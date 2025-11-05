const { workerData, parentPort } = require('worker_threads');
const WebScraper = require('./scraper');

class BrowserWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.scraper = new WebScraper();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    console.log(`Worker ${this.workerId} initializing...`);
    await this.scraper.initialize();
    this.isInitialized = true;
    console.log(`Worker ${this.workerId} initialized successfully`);
  }

  async handleScrape(data) {
    const { word, options } = data;
    return await this.scraper.scrapePage(word, options);
  }

  async handleGetStatus() {
    return this.scraper.getStatus ? this.scraper.getStatus() : { status: 'active' };
  }

  async handleShutdown() {
    console.log(`Worker ${this.workerId} shutting down...`);
    await this.scraper.close();
    console.log(`Worker ${this.workerId} shutdown complete`);
    process.exit(0);
  }

  async handleMessage(message) {
    try {
      const { messageId, action, data } = message;
      
      if (!this.isInitialized && action !== 'shutdown') {
        await this.initialize();
      }
      
      let result;
      switch (action) {
        case 'scrape':
          result = await this.handleScrape(data);
          break;
        case 'getStatus':
          result = await this.handleGetStatus();
          break;
        case 'shutdown':
          await this.handleShutdown();
          return; // 不需要发送响应
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      parentPort.postMessage({
        messageId,
        type: 'success',
        data: result
      });
    } catch (error) {
      parentPort.postMessage({
        messageId: message.messageId,
        type: 'error',
        error: error.message
      });
    }
  }

  start() {
    parentPort.on('message', (message) => {
      this.handleMessage(message);
    });
    
    // 发送初始化完成消息
    this.initialize().then(() => {
      parentPort.postMessage({
        type: 'initialized'
      });
    }).catch(error => {
      console.error(`Worker ${this.workerId} initialization failed:`, error);
      process.exit(1);
    });
  }
}

console.log(`Worker ${workerData.workerId} started`);
// 启动 worker
const worker = new BrowserWorker(workerData.workerId);
worker.start();