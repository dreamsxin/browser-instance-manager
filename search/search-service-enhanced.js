const { chromium } = require('playwright');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker');

class EnhancedGoogleSearchService {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.pageStatus = new Map(); // 'idle' | 'busy' | 'keepalive'
    this.taskQueue = [];
    this.wsServer = null;
    this.maxPages = 10;
    this.isInitialized = false;
    this.keepAliveIntervals = new Map();
    this.keepAliveConfig = {
      interval: 5 * 60 * 1000, // 5分钟执行一次保活
      minInterval: 3 * 60 * 1000, // 最小3分钟
      maxInterval: 10 * 60 * 1000, // 最大10分钟
    };
  }

  // 人类行为延迟函数
  async humanDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 模拟人类输入速度
  async typeWithRandomSpeed(page, selector, text) {
    for (const char of text) {
      await page.type(selector, char, { delay: Math.random() * 100 + 50 });
      // 随机延迟
      if (Math.random() > 0.7) {
        await this.humanDelay(100, 300);
      }
    }
  }

  // 页面保活机制
  async startKeepAliveForPage(page, pageIndex) {
    const keepAlive = async () => {
      // 如果页面正在执行任务，跳过本次保活
      if (this.pageStatus.get(page) !== 'idle') {
        console.log(`页面 ${pageIndex + 1} 正在忙碌，跳过保活`);
        return;
      }

      try {
        console.log(`开始执行页面 ${pageIndex + 1} 的保活操作`);
        this.pageStatus.set(page, 'keepalive');

        // 访问Google
        await page.goto('https://www.google.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        console.log(`页面 ${pageIndex + 1}: 等待页面加载完成`);
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1000, 3000);

        console.log(`页面 ${pageIndex + 1}: 生成随机搜索词`);
        // 生成单个随机词
        const keyword = faker.word.sample();
        console.log(`页面 ${pageIndex + 1} 保活搜索词: ${keyword}`);

        // 输入搜索词
        const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
        await page.click(searchBoxSelector, { delay: 100 });
        await page.fill(searchBoxSelector, '');
        await this.typeWithRandomSpeed(page, searchBoxSelector, keyword);

        await this.humanDelay(500, 1000);

        console.log(`页面 ${pageIndex + 1}: 随机移动鼠标`);
        // 随机移动鼠标
        await page.mouse.move(
          Math.random() * 800 + 200,
          Math.random() * 400 + 100
        );

        console.log(`页面 ${pageIndex + 1}: 按回车键搜索`);
        // 按回车键搜索
        await page.keyboard.press('Enter');
        
        // 等待搜索结果
        await page.waitForSelector('body', { timeout: 10000 });
        const content = await page.content();
        
        if (content.length < 10000) {
          console.log(`页面 ${pageIndex + 1}: 搜索结果可能为空，重新尝试`);
          // 如果内容太少，可能是验证页面，重新导航
          await page.goto('https://www.google.com');
          return;
        }

        console.log(`页面 ${pageIndex + 1}: 搜索成功，页面内容长度: ${content.length}`);

        await this.humanDelay(1000, 3000);

        // 随机滚动页面 - 模拟人类阅读行为
        console.log(`页面 ${pageIndex + 1}: 随机滚动页面`);
        await page.evaluate(async () => {
          const scrollHeight = document.body.scrollHeight;
          const viewportHeight = window.innerHeight;
          const maxScroll = Math.max(0, scrollHeight - viewportHeight);
          const scrollSteps = Math.floor(Math.random() * 5) + 3; // 3-7次滚动

          for (let i = 0; i < scrollSteps; i++) {
            const targetScroll = Math.random() * maxScroll;
            window.scrollTo(0, targetScroll);
            await new Promise(resolve => 
              setTimeout(resolve, Math.random() * 500 + 200)
            );
          }
        });

        // 随机点击搜索结果
        const links = await page.$$('a h3');
        if (links.length > 0 && Math.random() > 0.3) { // 70%概率点击结果
          const randomIndex = Math.floor(Math.random() * links.length);
          const randomLink = links[randomIndex];
          
          console.log(`页面 ${pageIndex + 1}: 随机点击第${randomIndex + 1}个结果`);
          
          // 滚动到元素所在位置
          await randomLink.scrollIntoViewIfNeeded();
          await this.humanDelay(1000, 2000);
          
          try {
            await randomLink.click({ delay: 100 });
            await page.waitForSelector('body', { timeout: 5000 });
            await this.humanDelay(2000, 5000);
            
            // 返回Google搜索结果页
            await page.goBack({ waitUntil: 'domcontentloaded' });
          } catch (clickError) {
            console.log(`页面 ${pageIndex + 1}: 点击结果失败，继续保活流程`);
          }
        }

        console.log(`页面 ${pageIndex + 1}: 保活操作完成`);

      } catch (error) {
        console.error(`页面 ${pageIndex + 1} 保活操作错误:`, error.message);
        
        // 保活失败时尝试恢复页面状态
        try {
          await page.goto('https://www.google.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 15000 
          });
          console.log(`页面 ${pageIndex + 1}: 已恢复Google首页`);
        } catch (recoverError) {
          console.error(`页面 ${pageIndex + 1}: 恢复失败，需要重新创建页面`);
          // 在实际生产环境中，这里应该重新创建页面
        }
      } finally {
        // 恢复页面状态
        if (this.pageStatus.get(page) === 'keepalive') {
          this.pageStatus.set(page, 'idle');
          console.log(`页面 ${pageIndex + 1}: 保活完成，恢复空闲状态`);
        }
      }
    };

    // 随机间隔执行保活
    const scheduleKeepAlive = () => {
      const interval = Math.floor(
        Math.random() * 
        (this.keepAliveConfig.maxInterval - this.keepAliveConfig.minInterval) + 
        this.keepAliveConfig.minInterval
      );
      
      console.log(`页面 ${pageIndex + 1}: 下次保活将在 ${Math.round(interval/1000/60)} 分钟后执行`);
      
      const timeoutId = setTimeout(() => {
        keepAlive().finally(() => {
          if (this.keepAliveIntervals.has(page)) {
            scheduleKeepAlive();
          }
        });
      }, interval);
      
      this.keepAliveIntervals.set(page, timeoutId);
    };

    // 首次保活延迟启动
    const initialDelay = Math.floor(Math.random() * 60000) + 30000; // 30-90秒后开始
    setTimeout(() => {
      scheduleKeepAlive();
    }, initialDelay);
  }

  async initialize() {
    try {
      console.log('启动Playwright浏览器实例...');
      
      this.browser = await chromium.launch({ 
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]
      });

      console.log('创建页面池并启动保活机制...');
      for (let i = 0; i < this.maxPages; i++) {
        const context = await this.browser.newContext();
        
        // 屏蔽自动化特征
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        const page = await context.newPage();
        
        // 设置更真实的用户代理
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );

        // 导航到Google首页进行预热
        await page.goto('https://www.google.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        this.pagePool.push(page);
        this.pageStatus.set(page, 'idle');
        
        // 为每个页面启动保活机制
        this.startKeepAliveForPage(page, i);
        
        console.log(`页面 ${i + 1}/${this.maxPages} 初始化完成并启动保活`);
      }

      this.isInitialized = true;
      console.log('增强版搜索服务初始化完成');
    } catch (error) {
      console.error('初始化失败:', error);
      throw error;
    }
  }

  startWebSocketServer(port = 8080) {
    this.wsServer = new WebSocket.Server({ port });
    console.log(`WebSocket服务器启动在端口 ${port}`);

    this.wsServer.on('connection', (ws) => {
      console.log('新的客户端连接');
      
      ws.on('message', async (message) => {
        try {
          const task = JSON.parse(message);
          await this.handleSearchTask(task, ws);
        } catch (error) {
          console.error('处理消息错误:', error);
          this.sendError(ws, '无效的任务格式');
        }
      });

      ws.on('close', () => {
        console.log('客户端断开连接');
      });
    });
  }

  async handleSearchTask(task, ws) {
    const { keyword, taskId = uuidv4() } = task;
    
    if (!keyword) {
      return this.sendError(ws, '缺少keyword参数', taskId);
    }

    console.log(`接收到搜索任务: ${keyword} (ID: ${taskId})`);

    const idlePage = this.findIdlePage();
    
    if (!idlePage) {
      this.taskQueue.push({ task, ws, taskId });
      console.log(`无空闲页面，任务 ${taskId} 加入队列，当前队列长度: ${this.taskQueue.length}`);
      return;
    }

    await this.executeSearch(keyword, idlePage, ws, taskId);
  }

  findIdlePage() {
    for (const [page, status] of this.pageStatus) {
      if (status === 'idle') {
        return page;
      }
    }
    return null;
  }

  async executeSearch(keyword, page, ws, taskId) {
    try {
      // 取消当前页面的保活定时器（如果有）
      if (this.keepAliveIntervals.has(page)) {
        clearTimeout(this.keepAliveIntervals.get(page));
        this.keepAliveIntervals.delete(page);
      }

      this.pageStatus.set(page, 'busy');
      
      console.log(`开始搜索: ${keyword}`);

      this.sendMessage(ws, {
        type: 'status',
        taskId,
        status: 'searching',
        message: `正在搜索: ${keyword}`
      });

      // 导航到Google搜索页面
      await page.goto('https://www.google.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // 模拟人类行为：随机延迟
      await this.humanDelay(500, 1500);

      // 输入搜索关键词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      await page.click(searchBoxSelector, { delay: 100 });
      await page.fill(searchBoxSelector, '');
      await this.typeWithRandomSpeed(page, searchBoxSelector, keyword);

      await this.humanDelay(500, 1000);

      // 随机移动鼠标
      await page.mouse.move(
        Math.random() * 800 + 200,
        Math.random() * 400 + 100
      );

      // 按回车键搜索
      await page.keyboard.press('Enter');
      
      // 等待搜索结果加载
      await page.waitForSelector('#search, .g', { timeout: 15000 });

      // 提取搜索结果
      const searchResults = await page.$$eval('div.g', (results) => {
        return results.slice(0, 10).map((result, index) => {
          const titleElement = result.querySelector('h3, h3.LC20lb');
          const linkElement = result.querySelector('a');
          const descElement = result.querySelector('.VwiC3b, .s3v9rd, .st, .IsZvec');
          
          return {
            rank: index + 1,
            title: titleElement ? titleElement.innerText : '',
            url: linkElement ? linkElement.href : '',
            description: descElement ? descElement.innerText : ''
          };
        }).filter(item => item.title && item.url);
      });

      // 发送搜索结果
      this.sendMessage(ws, {
        type: 'result',
        taskId,
        keyword,
        results: searchResults,
        total: searchResults.length,
        timestamp: new Date().toISOString()
      });

      console.log(`搜索完成: ${keyword}, 找到 ${searchResults.length} 个结果`);

    } catch (error) {
      console.error(`搜索错误 ${keyword}:`, error);
      this.sendError(ws, `搜索失败: ${error.message}`, taskId);
    } finally {
      // 恢复页面状态
      this.pageStatus.set(page, 'idle');
      
      // 重新启动保活机制
      const pageIndex = this.pagePool.indexOf(page);
      if (pageIndex !== -1) {
        this.startKeepAliveForPage(page, pageIndex);
      }
      
      // 处理队列中的任务
      this.processQueue();
    }
  }

  processQueue() {
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      const idlePage = this.findIdlePage();
      
      if (idlePage && nextTask) {
        console.log(`从队列中取出任务执行: ${nextTask.task.keyword}`);
        this.executeSearch(
          nextTask.task.keyword, 
          idlePage, 
          nextTask.ws, 
          nextTask.taskId
        );
      }
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, errorMessage, taskId = null) {
    this.sendMessage(ws, {
      type: 'error',
      taskId,
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  async shutdown() {
    console.log('关闭增强版搜索服务...');
    
    // 清除所有保活定时器
    for (const timeoutId of this.keepAliveIntervals.values()) {
      clearTimeout(timeoutId);
    }
    this.keepAliveIntervals.clear();
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('增强版搜索服务已关闭');
  }
}

// 启动服务
async function startEnhancedService() {
  const searchService = new EnhancedGoogleSearchService();
  
  try {
    await searchService.initialize();
    searchService.startWebSocketServer(8080);
    
    // 优雅关闭处理
    process.on('SIGINT', async () => {
      await searchService.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await searchService.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('服务启动失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startEnhancedService();
}

module.exports = EnhancedGoogleSearchService;