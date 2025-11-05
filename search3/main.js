const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Worker } = require('worker_threads');
const path = require('path');

class ScrapingServer {
  constructor() {
    this.app = express();
    this.workers = [];
    this.currentWorkerIndex = 0;
    this.port = process.env.PORT || 3000;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  async initializeWorkers() {
    console.log('Initializing browser workers...');
    
    // 创建两个 worker 线程
    for (let i = 0; i < 2; i++) {
      const worker = new Worker(path.join(__dirname, 'browser-worker.js'), {
        workerData: { workerId: i }
      });
      
      // 等待 worker 初始化完成
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${i} initialization timeout`));
        }, 30000);
        
        worker.on('message', (message) => {
          if (message.type === 'initialized') {
            clearTimeout(timeout);
            console.log(`Worker ${i} initialized successfully`);
            resolve();
          }
        });
        
        worker.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      this.workers.push(worker);
    }
    
    console.log('All browser workers initialized');
  }

  setupRoutes() {
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      const workerStatus = this.workers.map((worker, index) => ({
        workerId: index,
        status: 'active'
      }));
      
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        workers: workerStatus
      });
    });

    // 单页面抓取端点 - 使用轮询策略分配任务
    this.app.post('/scrape', async (req, res) => {
      try {
        const { word, timeout, waitUntil } = req.body;

        if (!word) {
          return res.status(400).json({
            success: false,
            error: 'Word is required'
          });
        }

        console.log(`Processing scrape request for: ${word}`);

        // 使用轮询策略选择 worker
        const worker = this.workers[this.currentWorkerIndex];
        this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;

        const result = await this.sendToWorker(worker, 'scrape', {
          word,
          options: { timeout, waitUntil }
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }

      } catch (error) {
        console.error('Scrape endpoint error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // 批量抓取端点
    this.app.post('/scrape/batch', async (req, res) => {
      try {
        const { words, timeout, waitUntil } = req.body;

        if (!words || !Array.isArray(words) || words.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Words array is required and cannot be empty'
          });
        }

        if (words.length > 10) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 10 Words allowed per batch request'
          });
        }

        console.log(`Processing batch request for ${words.length} Words`);

        // 将任务均匀分配给所有 workers
        const promises = words.map((word, index) => {
          const worker = this.workers[index % this.workers.length];
          return this.sendToWorker(worker, 'scrape', {
            word,
            options: { timeout, waitUntil }
          });
        });

        const results = await Promise.allSettled(promises);
        
        const formattedResults = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              success: false,
              word: words[index],
              error: result.reason.message,
              timestamp: new Date().toISOString()
            };
          }
        });

        res.json({
          success: true,
          total: words.length,
          results: formattedResults
        });

      } catch (error) {
        console.error('Batch scrape endpoint error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // 获取 worker 状态
    this.app.get('/workers', async (req, res) => {
      try {
        const workerStatuses = await Promise.all(
          this.workers.map((worker, index) => 
            this.sendToWorker(worker, 'getStatus')
          )
        );
        
        res.json({
          success: true,
          workers: workerStatuses.map((status, index) => ({
            workerId: index,
            ...status
          }))
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Failed to get worker status'
        });
      }
    });
  }

  // 发送消息到 worker 并等待响应
  sendToWorker(worker, action, data = {}) {
    return new Promise((resolve, reject) => {
      const messageId = Math.random().toString(36).substring(2, 15);
      
      const timeout = setTimeout(() => {
        worker.removeListener('message', handleMessage);
        reject(new Error(`Worker timeout for action: ${action}`));
      }, 60000); // 60秒超时
      
      const handleMessage = (response) => {
        if (response.messageId === messageId) {
          clearTimeout(timeout);
          worker.removeListener('message', handleMessage);
          
          if (response.type === 'error') {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        }
      };
      
      worker.on('message', handleMessage);
      worker.postMessage({
        messageId,
        action,
        data
      });
    });
  }

  setupErrorHandling() {
    // 404 处理
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });

    // 全局错误处理
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  async start() {
    try {
      // 初始化 worker 线程
      await this.initializeWorkers();
      
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 Web Scraping Server running on port ${this.port}`);
        console.log(`👷 ${this.workers.length} browser workers initialized`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
      });

      // 优雅关闭
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async gracefulShutdown() {
    console.log('Shutting down gracefully...');
    
    if (this.server) {
      this.server.close();
    }
    
    // 关闭所有 worker 线程
    await Promise.all(
      this.workers.map(worker => 
        this.sendToWorker(worker, 'shutdown').catch(console.error)
      )
    );
    
    console.log('Server shutdown complete');
    process.exit(0);
  }
}

// 启动服务器
if (require.main === module) {
  const server = new ScrapingServer();
  server.start();
}

module.exports = ScrapingServer;