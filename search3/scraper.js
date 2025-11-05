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
    this.requestCount = 0; // 新增：请求计数器
    this.maxRequestsBeforeRestart = 500; // 新增：重启阈值
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
          // "--no-default-browser-check",
          // "--disable-default-apps",
          // "--disable-blink-features=AutomationControlled",
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
      // 初始化10个页面
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      const fingerprintSeed = Math.floor(Math.random() * 100000);
      this.browser = await this.initBrowser();
      this.browser2 = await this.initBrowser();
      this.isInitialized = true;
      console.log('Playwright browser initialized');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async checkAndRestartBrowser() {
    this.requestCount++;
    console.log(`Request count: ${this.requestCount}/${this.maxRequestsBeforeRestart}`);
    
    if (this.requestCount >= this.maxRequestsBeforeRestart) {
      console.log(`Reached ${this.maxRequestsBeforeRestart} requests, restarting browser...`);
      await this.browser.close();
      this.browser = this.browser2;
      this.browser2 = await this.initBrowser();
      console.log('Browser restarted successfully');
    }
  }

  async scrapePage(word, options = {}) {
    const startTime = performance.now();
    await this.checkAndRestartBrowser();

    const {
      timeout = 2000,
      waitUntil = 'commit' // 'commit' // 'domcontentloaded',
      //userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    } = options;

    let page = null;
    let context = null;
    let newProxyUrl = null;
    let proxyUrls = [
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
    try {
      // 创建新页面
      newProxyUrl = await ProxyChain.anonymizeProxy(oldProxyUrl);
      console.log(newProxyUrl);
      context = await this.browser.newContext({
        viewport: null,
        proxy: newProxyUrl
          ? {
            server: newProxyUrl,
          }
          : undefined,
      });
      page = await context.newPage();

      // 设置用户代理和视口
      //await page.setViewportSize({ width: 1920, height: 1080 });
      //await page.setUserAgent(userAgent);

      // 设置请求拦截以优化性能
      await page.route('**/*', (route) => {
        if (!route.request().url().includes('google.com')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/xjs/')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/gen_')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com//client_')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/log')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/async')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/maps')) {
          route.abort();
          return
        }
        if (route.request().url().includes('google.com/image')) {
          route.abort();
          return
        }
        if (route.request().url().includes('gstatic.com/')) {
          route.abort();
          return
        }
        if (route.request().url().includes('youtube.com/')) {
          route.abort();
          return
        }
        if (route.request().url().includes('withgoogle.com')) {
          route.abort();
          return
        }
        if (route.request().url().startsWith('blob:')) {
          route.abort();
          return
        }
        const resourceType = route.request().resourceType();
        // 阻止图片、字体、媒体文件加载以提高速度
        if (['image', 'font', 'media'].includes(resourceType)) {
          //console.log('abort', resourceType); // , route.request().url()
          route.abort();
        } else {
          route.continue();
        }
      });

      // const urlstr = await page.url();
      // if (!urlstr.includes('google.com/search')) {
        // 访问 Google 主页
        const response = await page.goto('https://www.google.com', {
          waitUntil: 'domcontentloaded',
          timeout: timeout
        });
        console.log(`Page load status: ${response?.status()}`);
      //}

      console.log("domcontentloaded time:"+Math.floor(performance.now() - startTime));
      // 输入搜索关键词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      await page.waitForSelector(searchBoxSelector, { timeout: timeout, state: 'visible' });
      await page.fill(searchBoxSelector, word);
      await page.keyboard.press("Enter");
      console.log("Enter time:"+Math.floor(performance.now() - startTime));

      // 导航到页面
      // const response = await page.goto(url, {
      //   timeout,
      //   waitUntil
      // });

      await page.waitForURL('**/search*', {
        waitUntil: waitUntil,
        timeout: timeout
      });
      await page.waitForSelector('#search', { timeout: timeout, state: 'visible' });
      await page.waitForTimeout(100);
      console.log("search time:"+Math.floor(performance.now() - startTime));

      // 获取页面内容
      const content = await page.content();

      // 创建目录（如果不存在）
      const outputDir = 'scraped-content';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }

      // 生成文件名（使用URL哈希）
      const requestId = word; // Buffer.from(url).toString('base64').replace(/[+/=]/g, '');

      fs.appendFileSync(outputDir + '/' + requestId + '.html', content + "\r\n", 'utf8', (err) => {
        if (err) {
          throw new Error('追加内容时发生错误');
        }
        console.log('内容已追加到文件！');
      });

      // 获取页面标题
      const title = await page.title();

      // 获取页面URL（处理重定向）
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
      // 确保页面被关闭
      if (page) {
        await page.close().catch(console.error);
      }
      if (context) {
        await context.close().catch(console.error);
      }
      if (newProxyUrl) {
        await ProxyChain.closeAnonymizedProxy(newProxyUrl, true);
      }
    }
  }

  async close() {
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
          url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return results;
  }
}

module.exports = WebScraper;