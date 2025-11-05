const { chromium } = require('playwright');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const ProxyChain = require("proxy-chain");
const { performance } = require('perf_hooks');

class WebScraper {
  constructor(options = {}) {
    // 从选项或命令行参数获取配置
    this.maxRequestsBeforeRestart = options.maxRequestsBeforeRestart || 
                                   parseInt(process.env.MAX_REQUESTS_BEFORE_RESTART) || 500;
    this.maxPageUsage = options.maxPageUsage || 
                       parseInt(process.env.MAX_PAGE_USAGE) || 20;
    this.initialPagePoolSize = options.initialPagePoolSize || 
                              parseInt(process.env.INITIAL_PAGE_POOL_SIZE) || 5;
    
    this.browser = null;
    this.isInitialized = false;
    this.requestCount = 0;
    
    // 单个浏览器的页面池
    this.pagePool = [];
    this.pageUsageCount = new Map();
    
    // 等待队列和页面状态管理
    this.waitingQueue = [];
    this.pageStatus = new Map(); // 记录页面状态: 'available', 'in-use', 'retiring'
    this.browserRestartInProgress = false;
    
    // 重启期间的请求队列
    this.restartQueue = [];
    this.restartPromise = null;

    console.log(`WebScraper initialized with:
  - maxRequestsBeforeRestart: ${this.maxRequestsBeforeRestart}
  - maxPageUsage: ${this.maxPageUsage}
  - initialPagePoolSize: ${this.initialPagePoolSize}`);
  }

  async initBrowser() {
    try {
      const fingerprintSeed = Math.floor(Math.random() * 100000);
      return await chromium.launch({
        executablePath: "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',

          `--fingerprint=${fingerprintSeed}`,
          '--timezone=Asia/Hong_Kong',
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=VizDisplayCompositor",
          "--disable-accelerated-2d-canvas",
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--enable-features=NetworkService,NetworkServiceInProcess',
        ]
      });
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.browser = await this.initBrowser();
      
      // 初始化页面池
      await this.initializePagePool();
      
      this.isInitialized = true;
      console.log('Playwright browser initialized with page pool');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async initializePagePool() {
    // 使用配置的页面池大小创建页面
    for (let i = 0; i < this.initialPagePoolSize; i++) {
      const page = await this.createPageWithProxy(this.browser);
      if (page) {
        const pageObj = { page, browser: this.browser, lastUsed: Date.now(), id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
        this.pagePool.push(pageObj);
        this.pageUsageCount.set(page, 0);
        this.pageStatus.set(page, 'available');
      }
    }
    console.log(`Page pool initialized with ${this.pagePool.length} pages (target: ${this.initialPagePoolSize})`);
  }

  async createPageWithProxy(browser) {
    let context = null;
    let page = null;
    
    try {
      const proxyUrls = [
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.182:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.182:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.163:5206',
        'http://mSV6YJemvL:jqPxPczwth@45.10.210.104:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.98.166:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.167:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.183:5206',
        'http://mSV6YJemvL:jqPxPczwth@45.9.110.208:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.190:5206',
        'http://mSV6YJemvL:jqPxPczwth@45.142.76.235:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.104.173:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.98.163:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.165:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.166:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.97.167:5206',
        'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.172:5206',
      ];
      
      const oldProxyUrl = proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
      const newProxyUrl = await ProxyChain.anonymizeProxy(oldProxyUrl);
      
      context = await browser.newContext({
        viewport: null,
        proxy: newProxyUrl ? { server: newProxyUrl } : undefined,
      });
      
      page = await context.newPage();
      await this.setupPageRoute(page);
      
      // 访问 Google 主页初始化页面
      const response = await page.goto('https://www.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 5000
      });
      
      console.log(`Page initialization status: ${response?.status()}`);
      
      return page;
      
    } catch (error) {
      console.error('Failed to create page with proxy:', error);
      if (page) await page.close().catch(console.error);
      if (context) await context.close().catch(console.error);
      return null;
    }
  }

  // 获取可用页面的方法，支持等待队列
  async getAvailablePage() {
    // 如果浏览器正在重启，等待重启完成
    if (this.browserRestartInProgress) {
      console.log('Browser restart in progress, waiting...');
      return new Promise((resolve) => {
        this.waitingQueue.push(resolve);
      });
    }
    
    // 清理使用次数过多的页面
    await this.cleanupOverusedPages();
    
    // 查找可用页面
    const availablePage = this.pagePool.find(p => this.pageStatus.get(p.page) === 'available');
    
    if (availablePage) {
      this.pageStatus.set(availablePage.page, 'in-use');
      availablePage.lastUsed = Date.now();
      return availablePage;
    }
    
    // 如果没有可用页面，等待直到有页面可用
    console.log('No available pages, waiting...');
    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  // 释放页面回池中
  releasePage(pageObj) {
    const usageCount = this.pageUsageCount.get(pageObj.page) || 0;
    
    if (usageCount >= this.maxPageUsage) {
      // 页面使用次数达到上限，标记为待退休
      this.pageStatus.set(pageObj.page, 'retiring');
      console.log(`Page marked for retirement (used ${usageCount} times)`);
    } else {
      // 重置页面状态为可用
      this.pageStatus.set(pageObj.page, 'available');
      pageObj.lastUsed = Date.now();
      
      // 检查是否有等待的请求
      if (this.waitingQueue.length > 0) {
        const resolve = this.waitingQueue.shift();
        resolve(pageObj);
      }
    }
  }

  async cleanupOverusedPages() {
    // 清理页面池
    for (let i = this.pagePool.length - 1; i >= 0; i--) {
      const pageObj = this.pagePool[i];
      const pageStatus = this.pageStatus.get(pageObj.page);
      
      if (pageStatus === 'retiring') {
        console.log(`Closing retired page`);
        await pageObj.page.close().catch(console.error);
        this.pageUsageCount.delete(pageObj.page);
        this.pageStatus.delete(pageObj.page);
        this.pagePool.splice(i, 1);
        
        // 如果池中页面太少，创建新页面补充
        const minPoolSize = Math.floor(this.initialPagePoolSize / 2);
        if (this.pagePool.length < minPoolSize && !this.browserRestartInProgress) {
          const newPage = await this.createPageWithProxy(this.browser);
          if (newPage) {
            const newPageObj = { page: newPage, browser: this.browser, lastUsed: Date.now(), id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
            this.pagePool.push(newPageObj);
            this.pageUsageCount.set(newPage, 0);
            this.pageStatus.set(newPage, 'available');
            console.log('Added new page to pool');
            
            // 如果有等待的请求，立即分配新页面
            if (this.waitingQueue.length > 0) {
              const resolve = this.waitingQueue.shift();
              resolve(newPageObj);
            }
          }
        }
      }
    }
  }

  async setupPageRoute(page) {
    await page.route('**/*', (route) => {
      if (!route.request().url().includes('google.com')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/xjs/')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/gen_')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/client_')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/log')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/async')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/maps')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('google.com/image')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('gstatic.com/')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('youtube.com/')) {
        route.abort();
        return;
      }
      if (route.request().url().includes('withgoogle.com')) {
        route.abort();
        return;
      }
      if (route.request().url().startsWith('blob:')) {
        route.abort();
        return;
      }
      
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
  }

  // 等待所有页面完成当前任务
  async waitForAllPagesToComplete(timeoutMs = 30000) {
    console.log('Waiting for all pages to complete current tasks...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const inUsePages = this.pagePool.filter(p => this.pageStatus.get(p.page) === 'in-use');
      
      if (inUsePages.length === 0) {
        console.log('All pages have completed their tasks');
        return true;
      }
      
      console.log(`Waiting for ${inUsePages.length} pages to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`Timeout reached, but ${this.pagePool.filter(p => this.pageStatus.get(p.page) === 'in-use').length} pages are still in use`);
    return false;
  }

  // 重启浏览器的方法，返回一个Promise
  async restartBrowser() {
    if (this.browserRestartInProgress) {
      console.log('Browser restart already in progress, waiting...');
      return this.restartPromise;
    }
    
    this.browserRestartInProgress = true;
    console.log(`Starting browser restart...`);
    
    // 创建重启Promise
    this.restartPromise = new Promise(async (resolve, reject) => {
      try {
        console.log(`Waiting for all pages to complete current tasks before restart...`);
        
        // 等待所有页面完成当前任务
        const allCompleted = await this.waitForAllPagesToComplete();
        
        if (!allCompleted) {
          console.log('Some pages did not complete in time, proceeding with restart anyway');
        }
        
        console.log(`Restarting browser...`);
        
        // 关闭所有页面
        for (const pageObj of this.pagePool) {
          await pageObj.page.close().catch(console.error);
          this.pageUsageCount.delete(pageObj.page);
          this.pageStatus.delete(pageObj.page);
        }
        this.pagePool.length = 0;
        
        // 关闭浏览器
        await this.browser.close();
        
        // 重新启动浏览器
        this.browser = await this.initBrowser();
        
        // 重新初始化页面池
        await this.initializePagePool();
        
        console.log(`Browser restarted successfully`);
        this.requestCount = 0;
        this.browserRestartInProgress = false;
        this.restartPromise = null;
        
        resolve();
      } catch (error) {
        console.error('Browser restart failed:', error);
        this.browserRestartInProgress = false;
        this.restartPromise = null;
        reject(error);
      }
    });
    
    return this.restartPromise;
  }

  // 检查并重启浏览器，在重启期间将请求放入队列
  async checkAndRestartBrowser() {
    this.requestCount++;
    console.log(`Request count: ${this.requestCount}/${this.maxRequestsBeforeRestart}`);
    
    if (this.requestCount >= this.maxRequestsBeforeRestart && !this.browserRestartInProgress) {
      console.log(`Reached ${this.maxRequestsBeforeRestart} requests, queuing browser restart...`);
      
      // 异步执行重启，不阻塞当前请求
      this.restartBrowser().then(() => {
        console.log('Browser restart completed, resuming normal operations');
      }).catch(error => {
        console.error('Browser restart failed:', error);
      });
    }
  }

  async scrapePage(word, options = {}) {
    const startTime = performance.now();
    
    // 如果浏览器正在重启，等待重启完成
    if (this.browserRestartInProgress && this.restartPromise) {
      console.log(`Browser restart in progress, waiting for restart to complete for: ${word}`);
      try {
        await this.restartPromise;
        console.log(`Browser restart completed, proceeding with: ${word}`);
      } catch (error) {
        console.error(`Browser restart failed for ${word}:`, error);
        return {
          success: false,
          word: word,
          url: "",
          error: `Browser restart failed: ${error.message}`,
          responseTime: 0,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // 检查是否需要重启（这会在后台触发重启）
    await this.checkAndRestartBrowser();

    const {
      timeout = 2000,
      waitUntil = 'commit'
    } = options;

    let pageObj = null;
    
    try {
      // 从页面池获取可用页面（可能会等待）
      pageObj = await this.getAvailablePage();
      const page = pageObj.page;
      
      // 增加页面使用计数
      const currentUsage = this.pageUsageCount.get(page) || 0;
      this.pageUsageCount.set(page, currentUsage + 1);
      
      console.log(`Using page (used ${currentUsage + 1}/${this.maxPageUsage} times) for: ${word}`);

      // 清除搜索框并输入新关键词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      try {
        await page.waitForSelector(searchBoxSelector, { timeout: 3000, state: 'visible' });
        //await page.fill(searchBoxSelector, '');
        await page.fill(searchBoxSelector, word);
        await page.keyboard.press("Enter");
      } catch (error) {
        // 如果搜索失败，重新导航到Google主页
        console.log('Search failed, reloading Google homepage...');
        await page.goto('https://www.google.com', {
          waitUntil: 'domcontentloaded',
          timeout: timeout
        });
        await page.waitForSelector(searchBoxSelector, { timeout: timeout, state: 'visible' });
        await page.fill(searchBoxSelector, word);
        await page.keyboard.press("Enter");
      }

      console.log("Enter time:" + Math.floor(performance.now() - startTime));

      // 等待搜索结果页面加载
      await page.waitForURL('**/search*', {
        waitUntil: waitUntil,
        timeout: timeout
      });
      
      await page.waitForSelector('#search', { timeout: timeout, state: 'visible' });
      await page.waitForTimeout(100);
      console.log("search time:" + Math.floor(performance.now() - startTime));

      // 获取页面内容
      const content = await page.content();

      // 保存内容到文件
      const outputDir = 'scraped-content';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }

      const requestId = word;
      fs.appendFileSync(outputDir + '/' + requestId + '.html', content + "\r\n", 'utf8', (err) => {
        if (err) {
          throw new Error('追加内容时发生错误');
        }
        console.log('内容已追加到文件！');
      });

      // 获取页面标题和URL
      const title = await page.title();
      const finalUrl = page.url();
      const responseTime = Math.floor(performance.now() - startTime);

      if (content.length <= 10000) {
        return {
          success: false,
          word: word,
          url: finalUrl,
          title,
          content,
          responseTime,
          timestamp: new Date().toISOString()
        };
      }

      return {
        success: true,
        word: word,
        url: finalUrl,
        title,
        content,
        responseTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Scraping failed for ${word}:`, error.message);

      return {
        success: false,
        word: word,
        url: "",
        error: error.message,
        responseTime: 0,
        timestamp: new Date().toISOString()
      };

    } finally {
      // 释放页面回池中
      if (pageObj) {
        this.releasePage(pageObj);
      }
    }
  }

  async close() {
    // 清空等待队列
    this.waitingQueue = [];
    
    // 关闭所有页面
    for (const pageObj of this.pagePool) {
      await pageObj.page.close().catch(console.error);
    }
    this.pagePool = [];
    this.pageUsageCount.clear();
    this.pageStatus.clear();
    
    if (this.browser) {
      await this.browser.close();
      this.isInitialized = false;
      console.log('Browser closed');
    }
  }

  // 批量抓取多个URL
  async scrapeMultiple(words, options = {}) {
    const results = [];

    for (const word of words) {
      try {
        const result = await this.scrapePage(word, options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          word,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return results;
  }

  // 获取当前状态信息
  getStatus() {
    const available = this.pagePool.filter(p => this.pageStatus.get(p.page) === 'available').length;
    const inUse = this.pagePool.filter(p => this.pageStatus.get(p.page) === 'in-use').length;
    
    return {
      totalPages: this.pagePool.length,
      available: available,
      inUse: inUse,
      waitingQueue: this.waitingQueue.length,
      requestCount: this.requestCount,
      maxRequestsBeforeRestart: this.maxRequestsBeforeRestart,
      maxPageUsage: this.maxPageUsage,
      initialPagePoolSize: this.initialPagePoolSize,
      browserRestartInProgress: this.browserRestartInProgress
    };
  }
}

module.exports = WebScraper;