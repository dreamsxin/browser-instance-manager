const { chromium } = require("playwright");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const { faker } = require("@faker-js/faker");
const ProxyChain = require('proxy-chain');

class FixedKeepAliveGoogleSearchService {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.pageProxy = new Map();
    this.pageStatus = new Map(); // 'idle' | 'busy' | 'keepalive'
    this.taskQueue = [];
    this.wsServer = null;
    this.maxPages = 3;
    this.isInitialized = false;
    this.keepAliveIntervals = new Map();
    this.clients = new Set();

    // 保活统计
    this.keepAliveStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      lastExecution: null,
      pageStats: new Map(),
      executionHistory: [],
    };

    this.keepAliveConfig = {
      minInterval: 1 * 60 * 1000, // 最小1分钟
      maxInterval: 10 * 60 * 1000, // 最大10分钟
      maxHistory: 100,
    };

    // 跟踪启动保活状态
    this.initialKeepAliveCompleted = false;
  }

  // 人类行为延迟函数
  async humanDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // 模拟人类输入速度
  async typeWithRandomSpeed(page, selector, text) {
    for (const char of text) {
      await page.type(selector, char, { delay: Math.random() * 100 + 50 });
      if (Math.random() > 0.7) {
        await this.humanDelay(100, 300);
      }
    }
  }

  // 广播消息给所有客户端
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // 更新保活统计
  updateKeepAliveStats(pageIndex, success = true, details = {}) {
    const timestamp = new Date();
    const statKey = `page_${pageIndex + 1}`;

    if (!this.keepAliveStats.pageStats.has(statKey)) {
      this.keepAliveStats.pageStats.set(statKey, {
        total: 0,
        success: 0,
        fail: 0,
        lastExecution: null,
      });
    }

    const pageStat = this.keepAliveStats.pageStats.get(statKey);
    pageStat.total++;
    pageStat.lastExecution = timestamp;

    if (success) {
      pageStat.success++;
      this.keepAliveStats.successfulExecutions++;
    } else {
      pageStat.fail++;
      this.keepAliveStats.failedExecutions++;
    }

    this.keepAliveStats.totalExecutions++;
    this.keepAliveStats.lastExecution = timestamp;

    // 保存执行历史
    const historyEntry = {
      pageIndex: pageIndex + 1,
      timestamp,
      success,
      keyword: details.keyword,
      contentLength: details.contentLength,
      clickedResult: details.clickedResult,
      openedNewPages: details.openedNewPages || 0,
      duration: details.duration,
    };

    this.keepAliveStats.executionHistory.unshift(historyEntry);
    if (
      this.keepAliveStats.executionHistory.length >
      this.keepAliveConfig.maxHistory
    ) {
      this.keepAliveStats.executionHistory.pop();
    }

    // 广播统计更新
    this.broadcast({
      type: "keepalive_stats_update",
      stats: this.getFormattedStats(),
      recentActivity: this.keepAliveStats.executionHistory.slice(0, 10),
    });
  }

  // 获取格式化的统计信息
  getFormattedStats() {
    const pageStatsFormatted = {};
    this.keepAliveStats.pageStats.forEach((stats, pageKey) => {
      pageStatsFormatted[pageKey] = {
        ...stats,
        successRate:
          stats.total > 0
            ? ((stats.success / stats.total) * 100).toFixed(2) + "%"
            : "0%",
      };
    });

    return {
      totalExecutions: this.keepAliveStats.totalExecutions,
      successfulExecutions: this.keepAliveStats.successfulExecutions,
      failedExecutions: this.keepAliveStats.failedExecutions,
      successRate:
        this.keepAliveStats.totalExecutions > 0
          ? (
              (this.keepAliveStats.successfulExecutions /
                this.keepAliveStats.totalExecutions) *
              100
            ).toFixed(2) + "%"
          : "0%",
      lastExecution: this.keepAliveStats.lastExecution,
      pageStats: pageStatsFormatted,
      initialKeepAliveCompleted: this.initialKeepAliveCompleted,
    };
  }

  // 关闭所有新打开的页面（除了主页面）
  async closeNewPages(context, originalPages) {
    try {
      const currentPages = context.pages();
      const newPages = currentPages.filter(
        (page) => !originalPages.includes(page)
      );

      let closedCount = 0;
      for (const newPage of newPages) {
        try {
          await newPage.close();
          closedCount++;
          console.log(`✅ 已关闭新打开的页面`);
        } catch (closeError) {
          console.log(`⚠️ 关闭页面时出错: ${closeError.message}`);
        }
      }

      return closedCount;
    } catch (error) {
      console.error("关闭新页面时出错:", error);
      return 0;
    }
  }

  // 执行保活操作的核心函数
  async executeKeepAlive(page, pageIndex) {
    const startTime = Date.now();
    let success = false;
    let executionDetails = {
      keyword: "",
      contentLength: 0,
      clickedResult: false,
      openedNewPages: 0,
      duration: 0,
    };

    // 获取上下文和原始页面列表
    const context = page.context();
    const originalPages = context.pages();

    try {
      console.log(`\n🚀 开始执行页面 ${pageIndex + 1} 的保活操作`);
      this.pageStatus.set(page, "keepalive");

      // 广播保活开始
      this.broadcast({
        type: "keepalive_start",
        pageIndex: pageIndex + 1,
        timestamp: new Date().toISOString(),
      });

      // 访问Google
      await page.goto("https://www.google.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log(`📄 页面 ${pageIndex + 1}: 等待页面加载完成`);
      await this.humanDelay(1000, 3000);

      // 生成随机搜索词
      const keyword = faker.word.sample();
      executionDetails.keyword = keyword;
      console.log(`🔍 页面 ${pageIndex + 1} 保活搜索词: ${keyword}`);

      // 输入搜索词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      await page.click(searchBoxSelector, { delay: 100 });
      await page.fill(searchBoxSelector, "");
      await this.typeWithRandomSpeed(page, searchBoxSelector, keyword);

      await this.humanDelay(500, 1000);

      console.log(`🖱️  页面 ${pageIndex + 1}: 随机移动鼠标`);
      // 随机移动鼠标
      await page.mouse.move(
        Math.random() * 800 + 200,
        Math.random() * 400 + 100
      );

      console.log(`⌨️  页面 ${pageIndex + 1}: 按回车键搜索`);
      // 按回车键搜索
      await page.keyboard.press("Enter");

      // 等待搜索结果
      await page.waitForSelector("body", { timeout: 10000 });
      const content = await page.content();
      executionDetails.contentLength = content.length;

      console.log(`📊 页面 ${pageIndex + 1}: 页面内容长度: ${content.length}`);

      if (content.length < 10000) {
        console.log(`⚠️  页面 ${pageIndex + 1}: 搜索结果可能为空`);
        throw new Error("搜索结果页面内容过少");
      }

      console.log(`✅ 页面 ${pageIndex + 1}: 搜索成功`);
      await this.humanDelay(1000, 3000);

      // 随机滚动页面
      console.log(`📜 页面 ${pageIndex + 1}: 随机滚动页面`);
      await page.evaluate(async () => {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScroll = Math.max(0, scrollHeight - viewportHeight);
        const scrollSteps = Math.floor(Math.random() * 5) + 3;

        for (let i = 0; i < scrollSteps; i++) {
          const targetScroll = Math.random() * maxScroll;
          window.scrollTo(0, targetScroll);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 500 + 200)
          );
        }
      });

      // 随机点击搜索结果 - 修复新页面问题
      const links = await page.$$("a h3");
      if (links.length > 0 && Math.random() > 0.3) {
        try {
          const randomIndex = Math.floor(Math.random() * links.length);
          const randomLink = links[randomIndex];

          console.log(
            `🔗 页面 ${pageIndex + 1}: 随机点击第${randomIndex + 1}个结果`
          );

          await randomLink.scrollIntoViewIfNeeded();
          await this.humanDelay(1000, 2000);

          // 监听新页面打开事件
          const newPagePromise = context
            .waitForEvent("page", { timeout: 5000 })
            .catch(() => null); // 超时表示没有新页面打开

          // 点击链接
          await randomLink.click({ delay: 100 });

          // 等待可能的新页面
          const newPage = await newPagePromise;

          if (newPage) {
            console.log(
              `🆕 页面 ${pageIndex + 1}: 检测到新页面打开，等待加载...`
            );
            executionDetails.clickedResult = true;
            executionDetails.openedNewPages = 1;

            // 等待新页面加载
            await newPage.waitForLoadState("domcontentloaded");
            await this.humanDelay(2000, 4000);

            // 在新页面中执行一些随机操作
            console.log(`🔍 页面 ${pageIndex + 1}: 在新页面中浏览`);
            await newPage.evaluate(async () => {
              // 随机滚动新页面
              const scrollHeight = document.body.scrollHeight;
              const viewportHeight = window.innerHeight;
              const maxScroll = Math.max(0, scrollHeight - viewportHeight);
              const scrollTo = Math.random() * maxScroll;
              window.scrollTo(0, scrollTo);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            });

            await this.humanDelay(1000, 2000);

            // 关闭新页面
            console.log(`❌ 页面 ${pageIndex + 1}: 关闭新打开的页面`);
            await newPage.close();

            // 确保我们仍然在原始页面
            if (page.isClosed()) {
              console.log(
                `⚠️ 页面 ${pageIndex + 1}: 原始页面已关闭，需要重新创建`
              );
              throw new Error("原始页面在点击后关闭");
            }
          } else {
            // 没有新页面打开，在当前页面导航
            console.log(
              `🔙 页面 ${pageIndex + 1}: 在当前页面打开链接，等待加载后返回`
            );
            executionDetails.clickedResult = true;

            // 等待页面加载
            await page.waitForLoadState("domcontentloaded");
            await this.humanDelay(2000, 4000);

            // 返回搜索结果页
            await page.goBack({ waitUntil: "domcontentloaded" });
            const currentUrl = await page.url();
            // 判断是否是谷歌搜索结果页
            if (currentUrl.includes("google.com/search")) {
              console.log(`✅ 新页面是谷歌搜索结果页`);
            } else {
              console.log(`⚠️ 新页面不是谷歌搜索结果页`);
              // 访问Google
              await page.goto("https://www.google.com", {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });
            }
          }
        } catch (clickError) {
          console.log(
            `❌ 页面 ${pageIndex + 1}: 点击结果失败 - ${clickError.message}`
          );

          // 如果点击导致页面问题，尝试恢复
          if (page.isClosed()) {
            throw new Error("页面在点击操作后关闭");
          }
        }
      }

      success = true;
      console.log(`🎉 页面 ${pageIndex + 1}: 保活操作完成`);
    } catch (error) {
      console.error(`💥 页面 ${pageIndex + 1} 保活操作错误:`, error.message);

      // 保活失败时尝试恢复页面状态
      try {
        // 确保关闭所有可能打开的新页面
        const closedCount = await this.closeNewPages(context, originalPages);
        if (closedCount > 0) {
          console.log(
            `✅ 页面 ${pageIndex + 1}: 已关闭 ${closedCount} 个新页面`
          );
        }

        // 重新导航到Google首页
        if (!page.isClosed()) {
          await page.goto("https://www.google.com", {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          console.log(`🔄 页面 ${pageIndex + 1}: 已恢复Google首页`);
        } else {
          console.error(`🚨 页面 ${pageIndex + 1}: 页面已关闭，无法恢复`);
        }
      } catch (recoverError) {
        console.error(
          `🚨 页面 ${pageIndex + 1}: 恢复失败 - ${recoverError.message}`
        );
      }
    } finally {
      executionDetails.duration = Date.now() - startTime;

      // 最终清理：确保关闭所有新页面
      try {
        const finalClosedCount = await this.closeNewPages(
          context,
          originalPages
        );
        if (finalClosedCount > 0) {
          console.log(
            `🧹 页面 ${
              pageIndex + 1
            }: 最终清理，关闭了 ${finalClosedCount} 个新页面`
          );
          executionDetails.openedNewPages += finalClosedCount;
        }
      } catch (cleanupError) {
        console.error(
          `🚨 页面 ${pageIndex + 1}: 最终清理时出错 - ${cleanupError.message}`
        );
      }

      // 更新统计
      this.updateKeepAliveStats(pageIndex, success, executionDetails);

      // 恢复页面状态
      if (this.pageStatus.get(page) === "keepalive" && !page.isClosed()) {
        this.pageStatus.set(page, "idle");
        console.log(
          `🔄 页面 ${pageIndex + 1}: 恢复空闲状态，耗时 ${
            executionDetails.duration
          }ms`
        );
      } else if (page.isClosed()) {
        console.error(`🚨 页面 ${pageIndex + 1}: 页面已关闭，无法恢复空闲状态`);
        // 从池中移除已关闭的页面
        const pageIndexInPool = this.pagePool.indexOf(page);
        if (pageIndexInPool !== -1) {
          this.pagePool.splice(pageIndexInPool, 1);
          this.pageStatus.delete(page);
          console.log(`🗑️  页面 ${pageIndex + 1} 已从池中移除`);
        }
      }

      // 广播保活完成
      this.broadcast({
        type: "keepalive_complete",
        pageIndex: pageIndex + 1,
        success,
        duration: executionDetails.duration,
        openedNewPages: executionDetails.openedNewPages,
        timestamp: new Date().toISOString(),
      });

      return { success, duration: executionDetails.duration };
    }
  }

  // 页面保活机制
  async startKeepAliveForPage(page, pageIndex) {
    const keepAlive = async () => {
      // 如果页面正在执行任务，跳过本次保活
      if (this.pageStatus.get(page) !== "idle") {
        console.log(`页面 ${pageIndex + 1} 正在忙碌，跳过保活`);
        return;
      }

      await this.executeKeepAlive(page, pageIndex);
    };

    // 随机间隔执行保活
    const scheduleKeepAlive = () => {
      const interval = Math.floor(
        Math.random() *
          (this.keepAliveConfig.maxInterval -
            this.keepAliveConfig.minInterval) +
          this.keepAliveConfig.minInterval
      );

      const nextExecution = new Date(Date.now() + interval);
      console.log(
        `⏰ 页面 ${pageIndex + 1}: 下次保活将在 ${Math.round(
          interval / 1000 / 60
        )} 分钟后 (${nextExecution.toLocaleTimeString()})`
      );

      // 广播下次执行时间
      this.broadcast({
        type: "keepalive_scheduled",
        pageIndex: pageIndex + 1,
        nextExecution: nextExecution.toISOString(),
        intervalMinutes: Math.round(interval / 1000 / 60),
      });

      const timeoutId = setTimeout(() => {
        console.log(`🚀 页面 ${pageIndex + 1}: 开始定时保活`);
        keepAlive().finally(() => {
          if (this.keepAliveIntervals.has(page)) {
            scheduleKeepAlive();
          }
        });
      }, interval);

      this.keepAliveIntervals.set(page, timeoutId);
    };

    // 启动定时器
    scheduleKeepAlive();
  }

  // 执行初始保活（服务启动时立即执行）
  async executeInitialKeepAlive() {
    console.log("\n🎯 开始执行服务启动时的初始保活操作...");

    const keepAlivePromises = [];

    for (let i = 0; i < this.pagePool.length; i++) {
      const page = this.pagePool[i];

      // 为每个页面创建保活承诺，但错开启动时间
      const promise = new Promise((resolve) => {
        setTimeout(async () => {
          try {
            console.log(`🚀 页面 ${i + 1}: 开始初始保活`);
            const result = await this.executeKeepAlive(page, i);
            console.log(
              `✅ 页面 ${i + 1}: 初始保活完成，结果: ${
                result.success ? "成功" : "失败"
              }`
            );
            resolve({ pageIndex: i, ...result });
          } catch (error) {
            console.error(`💥 页面 ${i + 1}: 初始保活失败`, error);
            resolve({ pageIndex: i, success: false, error: error.message });
          }
        }, i * 3000); // 每个页面间隔3秒启动，避免同时发起大量请求
      });

      keepAlivePromises.push(promise);
    }

    // 等待所有初始保活完成
    const results = await Promise.all(keepAlivePromises);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    console.log(
      `\n🎉 初始保活操作完成! 成功: ${successCount}, 失败: ${failCount}, 总计: ${results.length}`
    );

    this.initialKeepAliveCompleted = true;

    // 广播初始保活完成
    this.broadcast({
      type: "initial_keepalive_complete",
      successCount,
      failCount,
      totalCount: results.length,
      timestamp: new Date().toISOString(),
    });

    return results;
  }

  async initialize() {
    try {
      console.log("🚀 启动Playwright浏览器实例...");

      this.browser = await chromium.launch({
        executablePath:
          "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
        headless: false, // 设置为true则不显示浏览器
        slowMo: 100, // 减慢操作速度
        args: [
          //   '--no-sandbox',
          //   '--disable-setuid-sandbox',
          "--disable-blink-features=AutomationControlled",
        ],
      });

      console.log("📄 创建页面池...");
      for (let i = 0; i < this.maxPages; i++) {
        const oldProxyUrl = "http://127.0.0.1:7890";
        const newProxyUrl = await proxyChain.anonymizeProxy(oldProxyUrl);

        // Prints something like "http://127.0.0.1:45678"
        console.log(newProxyUrl);
        const context = await this.browser.newContext({
          proxy: newProxyUrl ? {
            server: newProxyUrl,
          } : undefined,
        });

        // 屏蔽自动化特征
        // await context.addInitScript(() => {
        //   Object.defineProperty(navigator, 'webdriver', { get: () => false });
        //   Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        // });

        const page = await context.newPage();

        // 导航到Google首页进行预热
        await page.goto("https://www.google.com", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        this.pagePool.push(page);
        this.pageStatus.set(page, "idle");
        this.pageProxy.set(page, newProxyUrl);

        console.log(`✅ 页面 ${i + 1}/${this.maxPages} 初始化完成`);
      }

      this.isInitialized = true;
      console.log("🎉 搜索服务初始化完成");

      // 启动WebSocket服务器
      this.startWebSocketServer(8080);

      // 执行初始保活（不阻塞服务启动）
      setTimeout(() => {
        this.executeInitialKeepAlive().then(() => {
          console.log("🎯 初始保活全部完成，开始定期保活调度...");

          // 初始保活完成后，为每个页面启动定期保活机制
          for (let i = 0; i < this.pagePool.length; i++) {
            this.startKeepAliveForPage(this.pagePool[i], i);
          }
        });
      }, 3000); // 服务启动后3秒开始初始保活
    } catch (error) {
      console.error("💥 初始化失败:", error);
      throw error;
    }
  }

  startWebSocketServer(port = 8080) {
    this.wsServer = new WebSocket.Server({ port });
    console.log(`🌐 WebSocket服务器启动在端口 ${port}`);

    this.wsServer.on("connection", (ws) => {
      console.log("🔗 新的客户端连接");
      this.clients.add(ws);

      // 发送初始统计信息
      ws.send(
        JSON.stringify({
          type: "initial_stats",
          stats: this.getFormattedStats(),
          config: this.keepAliveConfig,
          pageCount: this.maxPages,
          initialKeepAliveCompleted: this.initialKeepAliveCompleted,
        })
      );

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          if (data.type === "get_stats") {
            // 返回统计信息
            ws.send(
              JSON.stringify({
                type: "stats_response",
                stats: this.getFormattedStats(),
                recentActivity: this.keepAliveStats.executionHistory.slice(
                  0,
                  20
                ),
                initialKeepAliveCompleted: this.initialKeepAliveCompleted,
              })
            );
          } else if (data.type === "search") {
            // 处理搜索任务
            await this.handleSearchTask(data, ws);
          } else if (data.type === "force_keepalive") {
            // 强制执行保活
            this.forceKeepAliveForPage(data.pageIndex);
          } else {
            await this.handleSearchTask(data, ws);
          }
        } catch (error) {
          console.error("处理消息错误:", error);
          this.sendError(ws, "无效的消息格式");
        }
      });

      ws.on("close", () => {
        console.log("🔌 客户端断开连接");
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket错误:", error);
        this.clients.delete(ws);
      });
    });
  }

  // 强制为指定页面执行保活
  async forceKeepAliveForPage(pageIndex) {
    if (pageIndex < 1 || pageIndex > this.pagePool.length) {
      console.error(`❌ 无效的页面索引: ${pageIndex}`);
      return;
    }

    const page = this.pagePool[pageIndex - 1];
    if (this.pageStatus.get(page) !== "idle") {
      console.log(`⏳ 页面 ${pageIndex} 当前忙碌，无法强制保活`);
      return;
    }

    console.log(`🔧 强制为页面 ${pageIndex} 执行保活操作`);
    await this.executeKeepAlive(page, pageIndex - 1);
  }

  async handleSearchTask(task, ws) {
    const { keyword, taskId = uuidv4() } = task;

    if (!keyword) {
      return this.sendError(ws, "缺少keyword参数", taskId);
    }

    console.log(`📨 接收到搜索任务: ${keyword} (ID: ${taskId})`);

    const idlePage = this.findIdlePage();

    if (!idlePage) {
      this.taskQueue.push({ task, ws, taskId });
      console.log(
        `⏳ 无空闲页面，任务 ${taskId} 加入队列，当前队列长度: ${this.taskQueue.length}`
      );
      return;
    }

    await this.executeSearch(keyword, idlePage, ws, taskId);
  }

  findIdlePage() {
    for (const [page, status] of this.pageStatus) {
      if (status === "idle") {
        return page;
      }
    }
    return null;
  }

  async executeSearch(keyword, page, ws, taskId) {
    // 获取上下文和原始页面列表
    const context = page.context();
    const originalPages = context.pages();

    try {
      // 取消当前页面的保活定时器（如果有）
      if (this.keepAliveIntervals.has(page)) {
        clearTimeout(this.keepAliveIntervals.get(page));
        this.keepAliveIntervals.delete(page);
      }

      this.pageStatus.set(page, "busy");

      console.log(`🔍 开始搜索: ${keyword}`);

      this.sendMessage(ws, {
        type: "status",
        taskId,
        status: "searching",
        message: `正在搜索: ${keyword}`,
      });

      // 导航到Google搜索页面
      const currentUrl = await page.url();
      if (currentUrl.includes("google.com/search")) {
        console.log(`✅ 新页面是谷歌搜索结果页`);
      } else {
        console.log(`⚠️ 新页面不是谷歌搜索结果页`);
        // 访问Google
        await page.goto("https://www.google.com", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      }

      // 模拟人类行为
      // await this.humanDelay(500, 1500);

      // 输入搜索关键词
      const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
      await page.click(searchBoxSelector); // , { delay: 0 }
      await page.fill(searchBoxSelector, keyword);
      // await this.typeWithRandomSpeed(page, searchBoxSelector, keyword);

      //await this.humanDelay(500, 1000);

      // 随机移动鼠标
      // await page.mouse.move(
      //   Math.random() * 800 + 200,
      //   Math.random() * 400 + 100
      // );

      // 按回车键搜索
      await page.keyboard.press("Enter");

      // 等待搜索结果加载
      await page.waitForSelector("#search", { timeout: 15000 });

      // 提取搜索结果
      const searchResults = await page.$$eval("#search a", (results) => {
        return results
          .slice(0, 10)
          .map((result, index) => {
            // 获取标题 - 假设标题在 h3 标签内
            const titleElement = result.querySelector("h3");
            // 获取链接属性
            const href = result.getAttribute("href");

            return {
              rank: index + 1,
              title: titleElement ? titleElement.textContent.trim() : "",
              url: href || "",
              description: "",
            };
          })
          .filter((item) => item.title && item.url);
      });

      // 发送搜索结果
      this.sendMessage(ws, {
        type: "result",
        taskId,
        keyword,
        results: searchResults,
        total: searchResults.length,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ 搜索完成: ${keyword}, 找到 ${searchResults.length} 个结果`
      );

      // 随机点击搜索结果 - 修复新页面问题
      const links = await page.$$("a h3");
      if (links.length > 0 && Math.random() > 0.3) {
        try {
          const randomIndex = Math.floor(Math.random() * links.length);
          const randomLink = links[randomIndex];

          console.log(`🔗 随机点击第${randomIndex + 1}个结果`);

          await randomLink.scrollIntoViewIfNeeded();
          await this.humanDelay(1000, 2000);

          // 监听新页面打开事件
          const newPagePromise = context
            .waitForEvent("page", { timeout: 5000 })
            .catch(() => null); // 超时表示没有新页面打开

          // 点击链接
          await randomLink.click({ delay: 100 });

          // 等待可能的新页面
          const newPage = await newPagePromise;

          if (newPage) {
            console.log(`🆕 检测到新页面打开，等待加载...`);

            // 等待新页面加载
            await newPage.waitForLoadState("domcontentloaded");
            await this.humanDelay(500, 2000);

            // 关闭新页面
            console.log(`❌ 关闭新打开的页面`);
            await newPage.close();
          } else {
            // 没有新页面打开，在当前页面导航
            console.log(`🔙  在当前页面打开链接，等待加载后返回`);

            // 等待页面加载
            await page.waitForLoadState("domcontentloaded");
            await this.humanDelay(500, 2000);

            // 返回搜索结果页
            await page.goBack({ waitUntil: "domcontentloaded" });

            // 判断是否是谷歌搜索结果页
            const currentUrl = await page.url();
            if (currentUrl.includes("google.com/search")) {
              console.log(`✅ 新页面是谷歌搜索结果页`);
            } else {
              console.log(`⚠️ 新页面不是谷歌搜索结果页`);
              // 访问Google
              await page.goto("https://www.google.com", {
                waitUntil: "domcontentloaded",
                timeout: 30000,
              });
            }
          }
        } catch (clickError) {
          console.log(`❌ 点击结果失败 - ${clickError.message}`);
        }
      }
    } catch (error) {
      console.error(`💥 搜索错误 ${keyword}:`, error);
      this.sendError(ws, `搜索失败: ${error.message}`, taskId);
    } finally {
      // 清理可能打开的新页面
      try {
        await this.closeNewPages(context, originalPages);
      } catch (cleanupError) {
        console.error(`清理新页面时出错: ${cleanupError.message}`);
      }

      // 恢复页面状态
      this.pageStatus.set(page, "idle");

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
        console.log(`🔄 从队列中取出任务执行: ${nextTask.task.keyword}`);
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
      type: "error",
      taskId,
      message: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  async shutdown() {
    console.log("🛑 关闭搜索服务...");

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

    console.log("✅ 搜索服务已关闭");
  }
}

// 启动服务
async function startService() {

  const searchService = new FixedKeepAliveGoogleSearchService();

  try {
    await searchService.initialize();

    // 优雅关闭处理
    process.on("SIGINT", async () => {
      console.log("\n🛑 接收到关闭信号...");
      await searchService.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n🛑 接收到终止信号...");
      await searchService.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error("💥 服务启动失败:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  startService();
}

module.exports = FixedKeepAliveGoogleSearchService;
