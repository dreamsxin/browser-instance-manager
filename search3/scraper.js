const { chromium } = require('playwright');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const ProxyChain = require("proxy-chain");
const { performance } = require('perf_hooks');

class WebScraper {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
    this.browser2 = null;
    this.requestCount = 0;
    this.maxRequestsBeforeRestart = 500;
    
    // 分开管理两个浏览器的页面池
    this.browser1PagePool = [];
    this.browser2PagePool = [];
    this.pageUsageCount = new Map();
    this.maxPageUsage = 20;
    
    // 当前使用的浏览器标识
    this.currentBrowser = 'browser1';
    this.browserRestartInProgress = false;
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
      this.browser2 = await this.initBrowser();
      
      // 分别初始化两个浏览器的页面池
      await this.initializeBrowserPagePool(this.browser, this.browser1PagePool);
      await this.initializeBrowserPagePool(this.browser2, this.browser2PagePool);
      
      this.isInitialized = true;
      console.log('Playwright browser initialized with separate page pools');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async initializeBrowserPagePool(browser, pagePool) {
    // 为每个浏览器创建5个页面
    for (let i = 0; i < 5; i++) {
      const page = await this.createPageWithProxy(browser);
      if (page) {
        pagePool.push({ page, browser, lastUsed: Date.now() });
        this.pageUsageCount.set(page, 0);
      }
    }
    console.log(`Browser page pool initialized with ${pagePool.length} pages`);
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

  async getAvailablePage() {
    // 清理使用次数过多的页面
    await this.cleanupOverusedPages();
    
    // 根据当前使用的浏览器选择页面池
    const currentPagePool = this.currentBrowser === 'browser1' ? this.browser1PagePool : this.browser2PagePool;
    const availablePages = currentPagePool.filter(p => !p.inUse);
    
    if (availablePages.length === 0) {
      // 如果没有可用页面，尝试从另一个浏览器的页面池获取
      const alternatePagePool = this.currentBrowser === 'browser1' ? this.browser2PagePool : this.browser1PagePool;
      const alternateAvailablePages = alternatePagePool.filter(p => !p.inUse);
      
      if (alternateAvailablePages.length > 0) {
        console.log(`Switching to ${this.currentBrowser === 'browser1' ? 'browser2' : 'browser1'} due to no available pages in current browser`);
        this.currentBrowser = this.currentBrowser === 'browser1' ? 'browser2' : 'browser1';
        const selectedPage = alternateAvailablePages[0];
        selectedPage.inUse = true;
        selectedPage.lastUsed = Date.now();
        return selectedPage;
      }
      
      // 如果两个浏览器都没有可用页面，创建新的
      const currentBrowser = this.currentBrowser === 'browser1' ? this.browser : this.browser2;
      const newPage = await this.createPageWithProxy(currentBrowser);
      if (newPage) {
        const pageObj = { page: newPage, browser: currentBrowser, lastUsed: Date.now() };
        currentPagePool.push(pageObj);
        this.pageUsageCount.set(newPage, 0);
        pageObj.inUse = true;
        return pageObj;
      }
      throw new Error('No available pages and failed to create new page');
    }
    
    // 返回使用次数最少的页面
    availablePages.sort((a, b) => {
      const countA = this.pageUsageCount.get(a.page) || 0;
      const countB = this.pageUsageCount.get(b.page) || 0;
      return countA - countB;
    });
    
    const selectedPage = availablePages[0];
    selectedPage.inUse = true;
    selectedPage.lastUsed = Date.now();
    
    return selectedPage;
  }

  async cleanupOverusedPages() {
    // 清理浏览器1的页面池
    for (let i = this.browser1PagePool.length - 1; i >= 0; i--) {
      const pageObj = this.browser1PagePool[i];
      const usageCount = this.pageUsageCount.get(pageObj.page) || 0;
      
      if (usageCount >= this.maxPageUsage && !pageObj.inUse) {
        console.log(`Closing overused page from browser1 (used ${usageCount} times)`);
        await pageObj.page.close().catch(console.error);
        this.pageUsageCount.delete(pageObj.page);
        this.browser1PagePool.splice(i, 1);
      }
    }
    
    // 清理浏览器2的页面池
    for (let i = this.browser2PagePool.length - 1; i >= 0; i--) {
      const pageObj = this.browser2PagePool[i];
      const usageCount = this.pageUsageCount.get(pageObj.page) || 0;
      
      if (usageCount >= this.maxPageUsage && !pageObj.inUse) {
        console.log(`Closing overused page from browser2 (used ${usageCount} times)`);
        await pageObj.page.close().catch(console.error);
        this.pageUsageCount.delete(pageObj.page);
        this.browser2PagePool.splice(i, 1);
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
      if (route.request().url().includes('google.com//client_')) {
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

  async checkAndRestartBrowser() {
    this.requestCount++;
    console.log(`Request count: ${this.requestCount}/${this.maxRequestsBeforeRestart}`);
    
    if (this.requestCount >= this.maxRequestsBeforeRestart && !this.browserRestartInProgress) {
      this.browserRestartInProgress = true;
      console.log(`Reached ${this.maxRequestsBeforeRestart} requests, restarting browser...`);
      
      // 根据当前使用的浏览器决定重启哪个
      if (this.currentBrowser === 'browser1') {
        await this.restartBrowser(this.browser, this.browser1PagePool, 'browser1');
        // 切换到浏览器2
        this.currentBrowser = 'browser2';
        console.log('Switched to browser2 for new requests');
      } else {
        await this.restartBrowser(this.browser2, this.browser2PagePool, 'browser2');
        // 切换到浏览器1
        this.currentBrowser = 'browser1';
        console.log('Switched to browser1 for new requests');
      }
      
      this.requestCount = 0;
      this.browserRestartInProgress = false;
      console.log('Browser restart completed');
    }
  }

  async restartBrowser(browser, pagePool, browserName) {
    console.log(`Restarting ${browserName}...`);
    
    // 关闭所有页面
    for (const pageObj of pagePool) {
      await pageObj.page.close().catch(console.error);
      this.pageUsageCount.delete(pageObj.page);
    }
    pagePool.length = 0;
    
    // 关闭浏览器
    await browser.close();
    
    // 重新启动浏览器
    const newBrowser = await this.initBrowser();
    if (browserName === 'browser1') {
      this.browser = newBrowser;
    } else {
      this.browser2 = newBrowser;
    }
    
    // 重新初始化页面池
    await this.initializeBrowserPagePool(newBrowser, pagePool);
    
    console.log(`${browserName} restarted successfully`);
  }

  async scrapePage(word, options = {}) {
    const startTime = performance.now();
    await this.checkAndRestartBrowser();

    const {
      timeout = 2000,
      waitUntil = 'commit'
    } = options;

    let pageObj = null;
    
    try {
      // 从页面池获取可用页面
      pageObj = await this.getAvailablePage();
      const page = pageObj.page;
      
      // 增加页面使用计数
      const currentUsage = this.pageUsageCount.get(page) || 0;
      this.pageUsageCount.set(page, currentUsage + 1);
      
      console.log(`Using page from ${this.currentBrowser} (used ${currentUsage + 1}/${this.maxPageUsage} times) for: ${word}`);

      // 清除搜索框并输入新关键词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      try {
        await page.waitForSelector(searchBoxSelector, { timeout: 3000, state: 'visible' });
        await page.fill(searchBoxSelector, '');
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
        pageObj.inUse = false;
      }
    }
  }

  async close() {
    // 关闭所有页面
    for (const pageObj of this.browser1PagePool) {
      await pageObj.page.close().catch(console.error);
    }
    for (const pageObj of this.browser2PagePool) {
      await pageObj.page.close().catch(console.error);
    }
    this.browser1PagePool = [];
    this.browser2PagePool = [];
    this.pageUsageCount.clear();
    
    if (this.browser) {
      await this.browser.close();
      this.isInitialized = false;
      console.log('Browser closed');
    }
    if (this.browser2) {
      await this.browser2.close();
      console.log('Browser2 closed');
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
    return {
      currentBrowser: this.currentBrowser,
      browser1Pages: this.browser1PagePool.length,
      browser2Pages: this.browser2PagePool.length,
      requestCount: this.requestCount,
      maxRequestsBeforeRestart: this.maxRequestsBeforeRestart,
      browserRestartInProgress: this.browserRestartInProgress
    };
  }
}

module.exports = WebScraper;