const { chromium } = require('playwright');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class GoogleSearchService {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    // 页面状态: 'idle' | 'busy'
    this.pageStatus = new Map();
    this.taskQueue = [];
    this.wsServer = null;
    this.maxPages = 10;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('启动Playwright浏览器实例...');
      
      // 启动浏览器（建议使用无头模式生产环境）
      this.browser = await chromium.launch({
        executablePath: "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
        headless: false, // 设置为true则不显示浏览器
        slowMo: 100, // 减慢操作速度
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      console.log('创建页面池...');
      // 创建10个页面实例
      for (let i = 0; i < this.maxPages; i++) {
        const context = await this.browser.newContext();
        const page = await context.newPage();
        
        // 设置用户代理，模拟真实浏览器
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // 导航到Google首页进行预热
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        
        this.pagePool.push(page);
        this.pageStatus.set(page, 'idle');
        
        console.log(`页面 ${i + 1}/${this.maxPages} 初始化完成`);
      }

      this.isInitialized = true;
      console.log('搜索服务初始化完成');
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

    // 查找空闲页面
    const idlePage = this.findIdlePage();
    
    if (!idlePage) {
      // 如果没有空闲页面，加入队列
      this.taskQueue.push({ task, ws, taskId });
      console.log(`无空闲页面，任务 ${taskId} 加入队列，当前队列长度: ${this.taskQueue.length}`);
      return;
    }

    // 执行搜索
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
      // 标记页面为忙碌状态
      this.pageStatus.set(page, 'busy');
      
      console.log(`开始搜索: ${keyword} (使用页面 ${this.pagePool.indexOf(page) + 1})`);

      // 发送开始搜索状态
      this.sendMessage(ws, {
        type: 'status',
        taskId,
        status: 'searching',
        message: `正在搜索: ${keyword}`
      });

      // 导航到Google搜索页面
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
      
      // 输入搜索关键词
      await page.fill('input[name="q"]', keyword);
      
      // 等待并点击搜索按钮
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('input[name="btnK"]').catch(() => 
          page.keyboard.press('Enter')
        )
      ]);

      // 等待搜索结果加载
      await page.waitForSelector('#search', { timeout: 10000 });

      // 提取搜索结果
      const searchResults = await page.$$eval('div.g', (results) => {
        return results.slice(0, 10).map((result, index) => {
          const titleElement = result.querySelector('h3');
          const linkElement = result.querySelector('a');
          const descElement = result.querySelector('.VwiC3b, .s3v9rd, .st');
          
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
      // 无论成功失败，都将页面标记为空闲
      this.pageStatus.set(page, 'idle');
      console.log(`页面 ${this.pagePool.indexOf(page) + 1} 已释放`);
      
      // 检查队列中是否有等待的任务
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
    console.log('关闭搜索服务...');
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('搜索服务已关闭');
  }
}

// 启动服务
async function startService() {
  const searchService = new GoogleSearchService();
  
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

// 如果是直接运行此文件，则启动服务
if (require.main === module) {
  startService();
}

module.exports = GoogleSearchService;