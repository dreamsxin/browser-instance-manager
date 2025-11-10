const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const WebScraper = require('./scraper');
const ConcurrencyController = require('./concurrency');

class ScrapingServer {
  constructor() {
    this.app = express();
    
    // 从命令行参数或环境变量获取配置
    const maxRequestsBeforeRestart = parseInt(process.argv.find(arg => arg.startsWith('--max-requests='))?.split('=')[1]) || 
                                    parseInt(process.env.MAX_REQUESTS_BEFORE_RESTART) || 500;
    const maxPageUsage = parseInt(process.argv.find(arg => arg.startsWith('--max-page-usage='))?.split('=')[1]) || 
                         parseInt(process.env.MAX_PAGE_USAGE) || 20;
    const initialPagePoolSize = parseInt(process.argv.find(arg => arg.startsWith('--initial-page-pool='))?.split('=')[1]) || 
                               parseInt(process.env.INITIAL_PAGE_POOL_SIZE) || 5;
    const maxConcurrent = parseInt(process.argv.find(arg => arg.startsWith('--max-concurrent='))?.split('=')[1]) || 
                         parseInt(process.env.MAX_CONCURRENT) || 35;
    const redisUrl = process.argv.find(arg => arg.startsWith('--redis-url='))?.split('=')[1] || 
                     process.env.REDIS_URL || 'redis://192.168.0.80:6379';
    const redisPassword = process.argv.find(arg => arg.startsWith('--redis-password='))?.split('=')[1] || 
                         process.env.REDIS_PASSWORD || "123456";
    const redisDatabase = process.argv.find(arg => arg.startsWith('--redis-database='))?.split('=')[1] || 
                         process.env.REDIS_DATABASE || "11";
    
    // 创建 scraper 实例并传入配置
    this.scraper = new WebScraper({
      maxRequestsBeforeRestart,
      maxPageUsage,
      initialPagePoolSize,
      redisUrl,
      redisPassword,
      redisDatabase,
    });
    
    this.concurrencyController = new ConcurrencyController(maxConcurrent);
    this.port = process.env.PORT || 3000;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    console.log(`Server initialized with configuration:
  - Port: ${this.port}
  - Max Concurrent: ${maxConcurrent}
  - Max Requests Before Restart: ${maxRequestsBeforeRestart}
  - Max Page Usage: ${maxPageUsage}
  - Initial Page Pool Size: ${initialPagePoolSize}`);
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      const scraperStatus = this.scraper.getStatus();
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        concurrency: this.concurrencyController.getStats(),
        scraper: scraperStatus
      });
    });

    // 单页面抓取端点
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

        const result = await this.concurrencyController.execute(
          () => this.scraper.scrapePage(word, { timeout, waitUntil })
        );

        console.log(`Scrape result for ${word}:`, result.responseTime);
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

        const promises = words.map(word => 
          this.concurrencyController.execute(
            () => this.scraper.scrapePage(word, { timeout, waitUntil })
          )
        );

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

    // 手动重启端点
    this.app.post('/restart-browser', async (req, res) => {
      try {
        console.log('Manual browser restart requested');
        
        const result = await this.scraper.restartBrowser();
        
        res.json({
          success: true,
          message: 'Browser restarted successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Manual browser restart failed:', error);
        res.status(500).json({
          success: false,
          error: 'Browser restart failed',
          message: error.message
        });
      }
    });

    // 配置信息端点
    this.app.get('/config', (req, res) => {
      const scraperStatus = this.scraper.getStatus();
      res.json({
        maxConcurrent: this.concurrencyController.maxConcurrent,
        maxRequestsBeforeRestart: scraperStatus.maxRequestsBeforeRestart,
        maxPageUsage: scraperStatus.maxPageUsage,
        initialPagePoolSize: scraperStatus.initialPagePoolSize,
        port: this.port
      });
    });

    // 并发控制管理端点
    this.app.get('/concurrency', (req, res) => {
      res.json(this.concurrencyController.getStats());
    });

    this.app.put('/concurrency', (req, res) => {
      const { maxConcurrent } = req.body;
      
      if (typeof maxConcurrent !== 'number' || maxConcurrent < 1 || maxConcurrent > 100) {
        return res.status(400).json({
          error: 'maxConcurrent must be a number between 1 and 100'
        });
      }

      this.concurrencyController.setMaxConcurrent(maxConcurrent);
      
      res.json({
        success: true,
        message: `Concurrency limit updated to ${maxConcurrent}`,
        stats: this.concurrencyController.getStats()
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
      // 初始化浏览器
      await this.scraper.initialize();
      
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 Web Scraping Server running on port ${this.port}`);
        console.log(`📊 Max concurrent requests: ${this.concurrencyController.maxConcurrent}`);
        console.log(`🔄 Max requests before restart: ${this.scraper.maxRequestsBeforeRestart}`);
        console.log(`📄 Max page usage: ${this.scraper.maxPageUsage}`);
        console.log(`🔄 Initial page pool size: ${this.scraper.initialPagePoolSize}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
        console.log(`🔄 Manual restart: POST http://localhost:${this.port}/restart-browser`);
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
    
    await this.scraper.close();
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