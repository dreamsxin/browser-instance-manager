const express = require('express');
const { chromium } = require('playwright');
const { faker } = require("@faker-js/faker");
const ProxyChain = require("proxy-chain");
const { URL } = require('url');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require("uuid");
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const got = require('got');

class GoogleSearchService {
    constructor() {
        this.browser = null;
        this.pages = [];
        this.dataQueue = new Map(); // [];
        this.isInitialized = false;
        this.currentPageIndex = 0;
    }

    async init(proxies = []) {
        try {
            console.log('正在启动浏览器...');

            // 32位整数作为指纹种子
            const fingerprintSeed = 3211;//Math.floor(Math.random() * 100000);
            //const fingerprintSeed = 1000;//Math.floor(Math.random() * 100000);

            // 指定插件目录的路径
            //const pathToExtension = './my-fingerprint-chrome-v2.6.2';

            // 启动浏览器
            this.browser = await chromium.launch({
                executablePath: "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
                headless: false,
                slowMo: 100,
                args: [
                    `--fingerprint=${fingerprintSeed}`,
                    '--timezone=Asia/Hong_Kong',
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-default-apps",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--disable-features=VizDisplayCompositor",
                    "--disable-accelerated-2d-canvas",
                    "--disable-gpu",
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--enable-features=NetworkService,NetworkServiceInProcess',
                    '--disable-renderer-backgrounding',
                    // `--disable-extensions-except=${pathToExtension}`,
                    // `--load-extension=${pathToExtension}`
                ]
            });

            this.isInitialized = true;
            console.log(`初始化完成，共创建 ${this.pages.length} 个页面`);

            // 启动数据采集
            this.startDataCollection(proxies);

        } catch (error) {
            console.error('初始化失败:', error);
            throw error;
        }
    }

    async startDataCollection(proxies) {
        while (this.isInitialized) {
            var promises = [];

            for (const proxy of proxies) {
                const dataItem = this.dataQueue.get(proxy);
                if (dataItem && dataItem.useCount < 30) {
                    continue;
                }

                try {
                    //await this.captureGoogleData(proxy);
                    promises.push(this.captureGoogleData(proxy));
                } catch (error) {
                    console.error(`数据采集失败 (代理: ${proxy ? proxy.server : '无代理'}):`, error);
                }
                if (promises.length >= 5) {
                    await Promise.allSettled(promises);
                    promises = [];
                }
            }
            // 等待一段时间后继续采集
            await Promise.allSettled(promises);
            await this.delay(1000 + Math.random() * 5000);
        }
    }

    // 清理过期数据
    cleanExpiredData() {
        const initialLength = this.dataQueue.length;
        this.dataQueue = this.dataQueue.filter(item => item.useCount < item.maxUseCount || item.timestamp > Date.now() - 10 * 60 * 1000);
        const removedCount = initialLength - this.dataQueue.length;
        if (removedCount > 0) {
            console.log(`清理了 ${removedCount} 条过期数据`);
        }
    }

    // 人类行为延迟函数
    async humanDelay(min = 500, max = 2000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    async captureGoogleData(proxy) {
        const newProxyUrl = await ProxyChain.anonymizeProxy(proxy);
        const context = await this.browser.newContext({
            proxy: {
                server: newProxyUrl
            }
        });
        const page = await context.newPage();
        try {
            console.log('正在访问 Google...');

            // 监听网络请求以捕获 headers
            const headers = await this.captureHeaders(page);

            const urlstr = await page.url();
            if (!urlstr.includes('google.com/search')) {
                // 访问 Google 主页
                await page.goto('https://www.google.com', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            }

            // await page.waitForTimeout(1000);

            // 输入搜索关键词
            const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
            await page.waitForSelector(searchBoxSelector, { timeout: 5000, state: 'visible' });

            const keyword = faker.word.sample();
            await page.fill(searchBoxSelector, keyword);
            await page.keyboard.press("Enter");

            await page.waitForTimeout(3000);

            // 获取页面数据
            const url = page.url();
            const cookies = await page.context().cookies();
            // 设置使用次数限制（20-30次）
            const maxUseCount = Math.floor(Math.random() * 11) + 20; // 20-30次

            this.dataQueue.set(proxy, {
                url,
                cookies,
                headers,
                originalKeyword: keyword,
                proxy: proxy,
                timestamp: Date.now(),
                useCount: 0,
                maxUseCount: maxUseCount,
                id: uuidv4() // 唯一标识
            });
            console.log(`数据采集完成，队列大小: ${this.dataQueue.size}, 最大使用次数: ${maxUseCount}, proxy: ${proxy}`);

            // 随机点击搜索结果 - 修复新页面问题
            // const allLinks = await page.$$("a h3");
            // const visibleLinks = [];

            // for (const link of allLinks) {
            //     const isVisible = await link.isVisible();
            //     if (isVisible) {
            //         visibleLinks.push(link);
            //     }
            // }
            // if (visibleLinks.length > 0 && Math.random() > 0.5) {
            //     try {
            //         const randomIndex = Math.floor(Math.random() * visibleLinks.length);
            //         const randomLink = visibleLinks[randomIndex];

            //         console.log(
            //             `🔗 随机点击第${randomIndex + 1}个结果`
            //         );

            //         await randomLink.scrollIntoViewIfNeeded();
            //         await this.humanDelay(1000, 2000);

            //         // 监听新页面打开事件
            //         const newPagePromise = page.context().waitForEvent("page", { timeout: 5000 })
            //             .catch(() => null); // 超时表示没有新页面打开

            //         // 点击链接
            //         await randomLink.click({ delay: 100 });

            //         // 等待可能的新页面
            //         const newPage = await newPagePromise;

            //         if (newPage) {
            //             try {
            //                 console.log(
            //                     `🆕 检测到新页面打开，等待加载...`
            //                 );

            //                 // 等待新页面加载
            //                 await newPage.waitForLoadState("domcontentloaded");

            //                 await this.humanDelay(1000, 2000);

            //                 // 关闭新页面
            //                 console.log(`❌ 关闭新打开的页面`);
            //                 await newPage.close();

            //                 // 确保我们仍然在原始页面
            //                 if (page.isClosed()) {
            //                     console.log(
            //                         `⚠️ 原始页面已关闭，需要重新创建`
            //                     );
            //                     throw new Error("原始页面在点击后关闭");
            //                 }
            //             } catch (error) {
            //                 console.error(`❌ 关闭新页面时出错:`, error);
            //             } finally {
            //                 newPage.close();
            //             }
            //         } else {
            //             // 没有新页面打开，在当前页面导航
            //             console.log(
            //                 `🔙 在当前页面打开链接，等待加载后返回`
            //             );

            //             // 等待页面加载
            //             await page.waitForLoadState("domcontentloaded");
            //             await this.humanDelay(2000, 4000);

            //             // 返回搜索结果页
            //             await page.goBack({ waitUntil: "domcontentloaded" });
            //             const currentUrl = await page.url();
            //             // 判断是否是谷歌搜索结果页
            //             if (currentUrl.includes("google.com/search")) {
            //                 console.log(`✅ 新页面是谷歌搜索结果页`);
            //             } else {
            //                 console.log(`⚠️ 新页面不是谷歌搜索结果页`);
            //                 // 访问Google
            //                 await page.goto("https://www.google.com", {
            //                     waitUntil: "domcontentloaded",
            //                     timeout: 30000,
            //                 });
            //             }
            //         }
            //     } catch (error) {
            //         console.error('点击出错:', error);
            //     }
            // }

            return {
                url,
                cookies,
                headers,
                originalKeyword: keyword
            };

        } catch (error) {
            console.error('捕获 Google 数据时出错:', error);
        } finally {
            await page.close();
            await ProxyChain.closeAnonymizedProxy(proxy, true);
        }

    }

    async captureHeaders(page) {
        return new Promise((resolve) => {
            const headers = {};

            page.on('request', (request) => {
                const requestHeaders = request.headers();
                if (request.url().includes('google.com/search')) {
                    Object.assign(headers, requestHeaders);
                }
            });

            setTimeout(() => {
                resolve(headers);
            }, 3000);
        });
    }

    getSearchData() {
        // 查找可用的数据
        const availableData = [];
        for (let [proxy, dataItem] of this.dataQueue) {
            //if (dataItem.useCount < dataItem.maxUseCount) {
            availableData.push(dataItem);
            //}
        }

        if (availableData.length === 0) {
            return null;
        }

        // 选择使用次数最少的数据
        const data = availableData.reduce((prev, current) =>
            prev.useCount < current.useCount ? prev : current
        );

        // 更新使用计数
        data.useCount++;
        data.lastUsed = Date.now();
        this.dataQueue.set(data.proxy, data);

        console.log(`使用数据 ID: ${data.id}, 使用次数: ${data.useCount}/${data.maxUseCount}`);

        return data;
    }

    buildCookieString(cookies) {
        return cookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
    }

    async makeSearchRequest(searchData, keyword) {
        try {
            const parsedUrl = new URL(searchData.url);
            parsedUrl.searchParams.set('q', keyword);

            const headers = {
                ...searchData.headers,
            };

            if (searchData.cookies.length > 0) {
                headers['cookie'] = this.buildCookieString(searchData.cookies);
            }

            const options = {
                headers: headers,
                timeout: {
                    request: 30000
                },
                retry: {
                    limit: 2,
                    methods: ['GET']
                },
                followRedirect: false, // 手动处理重定向
                responseType: 'text',
                throwHttpErrors: false, // 不抛出HTTP错误
            };

            //console.log(headers);

            // Got 内置代理支持
            if (searchData.proxy) {
                options.agent = {
                    http: new HttpProxyAgent(searchData.proxy),
                    https: new HttpsProxyAgent(searchData.proxy)
                };
                console.log(`使用代理发送请求: ${searchData.proxy}`);
            }

            const response = await got(parsedUrl.toString(), options);

            console.log(`发送搜索请求: ${keyword}, URL: ${parsedUrl.toString()}, StatusCode: ${response.statusCode}`); // , Options: ${JSON.stringify(options)}

            const result = {
                statusCode: response.statusCode,
                headers: response.headers,
                data: response.body,
                searchUrl: parsedUrl.toString(),
                dataId: searchData.id,
                useCount: searchData.useCount,
                maxUseCount: searchData.maxUseCount,
                proxyUsed: !!searchData.proxy,
                redirectUrls: response.redirectUrls // Got 提供的重定向信息
            };

            // 检查拦截
            if (response.body.includes('detected unusual traffic') || response.body.includes('自动搜索系统')) {
                console.warn('请求可能被Google检测为异常流量');
                result.suspectedBlock = true;
                searchData.useCount = searchData.maxUseCount;
            }

            return result;

        } catch (error) {
            console.error('请求失败:', error.message);
            searchData.useCount = searchData.maxUseCount;
            return result;
        }
    }
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        this.isInitialized = false;
        if (this.browser) {
            await this.browser.close();
        }
        // 关闭所有代理
        for (const pageInfo of this.pages) {
            await ProxyChain.closeAnonymizedProxy(pageInfo.newProxyUrl, true);
        }
    }
}

// 创建 HTTP 服务
const app = express();
app.use(express.json());

const searchService = new GoogleSearchService();

// 初始化搜索服务
async function initializeService() {
    try {

        const proxies = [
            // 示例代理配置:
            'http://mSV6YJemvL:jqPxPczwth@45.10.210.96:5206',
            'http://mSV6YJemvL:jqPxPczwth@45.10.210.73:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.180:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.97.166:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.104.178:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.102.189:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.97.163:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.187:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.102.182:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.104.162:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.189:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.104.166:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.187:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.97.180:5206',
            'http://mSV6YJemvL:jqPxPczwth@83.150.224.221:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.100.162:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.188:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.102.176:5206',
            'http://mSV6YJemvL:jqPxPczwth@62.192.189.245:5206',
            'http://mSV6YJemvL:jqPxPczwth@45.9.110.209:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.102.175:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.100.177:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.100.164:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.175:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.188:5206',
            'http://mSV6YJemvL:jqPxPczwth@45.10.210.81:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.102.166:5206',
            'http://mSV6YJemvL:jqPxPczwth@83.150.224.201:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.98.164:5206',
            'http://mSV6YJemvL:jqPxPczwth@45.9.110.218:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.100.185:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.176:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.169:5206',
            'http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.163:5206',

        ];

        await searchService.init(proxies);
        console.log('Google 搜索服务初始化完成');
    } catch (error) {
        console.error('服务初始化失败:', error);
        process.exit(1);
    }
}

// Google 搜索接口
app.get('/google/search', async (req, res) => {
    try {
        const { keyword, q } = req.query;
        const searchKeyword = keyword || q;

        if (!searchKeyword) {
            return res.status(400).json({
                error: '缺少搜索关键词参数 (keyword 或 q)'
            });
        }

        // 获取搜索数据
        const searchData = searchService.getSearchData();

        if (!searchData) {
            console.error('服务暂不可用，无可用数据（所有数据已达到使用上限或队列为空）');
            return res.status(503).json({
                error: '服务暂不可用，无可用数据（所有数据已达到使用上限或队列为空）'
            });
        }

        console.log(`处理搜索请求: ${searchKeyword}, 使用代理: ${searchData.proxy ? searchData.proxy : '无代理'}`);

        // 发送搜索请求
        const result = await searchService.makeSearchRequest(searchData, searchKeyword);

        res.json({
            success: true,
            keyword: searchKeyword,
            statusCode: result.statusCode,
            dataLength: result.data.length,
            data: result.data,
            searchUrl: result.searchUrl,
            dataId: result.dataId,
            useCount: result.useCount,
            maxUseCount: result.maxUseCount,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('搜索请求处理失败:', error);
        res.status(600).json({
            error: '搜索请求失败: ' + error.message
        });
    }
});

// 服务状态接口
app.get('/google/status', (req, res) => {
    const availableData = searchService.dataQueue.filter(item => item.useCount < item.maxUseCount);
    const expiredData = searchService.dataQueue.filter(item => item.useCount >= item.maxUseCount);

    res.json({
        initialized: searchService.isInitialized,
        totalQueueSize: searchService.dataQueue.length,
        availableData: availableData.length,
        expiredData: expiredData.length,
        activePages: searchService.pages.length,
        dataUsage: availableData.map(item => ({
            id: item.id,
            useCount: item.useCount,
            maxUseCount: item.maxUseCount,
            remaining: item.maxUseCount - item.useCount
        })),
        timestamp: Date.now()
    });
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// 启动服务
const PORT = process.env.PORT || 3000;

async function startServer() {
    await initializeService();

    app.listen(PORT, () => {
        console.log(`Google 搜索服务运行在 http://localhost:${PORT}`);
        console.log(`可用接口:`);
        console.log(`  GET /google/search?keyword=搜索词`);
        console.log(`  GET /google/status`);
        console.log(`  GET /health`);
    });
}

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('正在关闭服务...');
    await searchService.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('正在关闭服务...');
    await searchService.close();
    process.exit(0);
});

// 启动服务
if (require.main === module) {
    startServer();
}

module.exports = { app, GoogleSearchService };