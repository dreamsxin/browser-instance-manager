const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const { faker } = require("@faker-js/faker");
const fs = require('fs');

class BrowserRequestManager {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.capturedData = {
            url: '',
            cookies: [],
            headers: {}
        };
    }

    async init(proxy) {
        // 启动浏览器
        this.browser = await chromium.launch({
            executablePath: "E:\\soft\\ungoogled-chromium_138.0.7204.183-1.1_windows_x64\\chrome.exe",
            headless: false, // 设置为true则不显示浏览器
            slowMo: 100, // 减慢操作速度
            args: [
                //   '--no-sandbox',
                //   '--disable-setuid-sandbox',
                //"--window-size=1920,1080", // 无头模式时，设置浏览器窗口大小
                //"--headless=new", // 启用新的headless模式
                "--no-first-run", // 禁用首次运行提示
                "--no-default-browser-check", // 禁用默认浏览器检查
                "--disable-default-apps", // 禁用默认应用
                "--disable-blink-features=AutomationControlled",
                "--disable-background-timer-throttling", // 禁用定时器节流
                "--disable-backgrounding-occluded-windows", // 禁用窗口遮挡
                "--disable-renderer-backgrounding", // 禁用渲染器后台
                "--disable-features=VizDisplayCompositor", // 禁用VizDisplayCompositor
                "--disable-accelerated-2d-canvas", // 禁用2D加速画布
                "--disable-gpu", // 禁用GPU加速
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--enable-features=NetworkService,NetworkServiceInProcess',
                '--disable-renderer-backgrounding',
            ],
            proxy: proxy ? {
                server: proxy.server,
                username: proxy.username,
                password: proxy.password
            } : undefined
        });

        // 创建浏览器上下文
        this.context = await this.browser.newContext({
        });

        this.page = await this.context.newPage();
    }

    async captureGoogleData() {
        try {
            console.log('正在访问 Google...');

            // 监听网络请求以捕获 headers
            const headersPromise = this.captureHeaders();

            // 访问 Google 主页
            await this.page.goto('https://www.google.com', {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // 等待页面完全加载
            await this.page.waitForTimeout(2000);

            // 输入搜索关键词，第一个输入框
            const searchBoxSelector = 'textarea[name="q"], input[name="q"]';
            await this.page.waitForSelector(searchBoxSelector, { timeout: 2000, state: 'visible' });
            // await searchBox.fill(keyword);
            // await page.click(searchBoxSelector); // , { delay: 0 }      // 生成随机搜索词
            const keyword = faker.word.sample();
            await this.page.fill(searchBoxSelector, keyword);
            // await this.typeWithRandomSpeed(page, searchBoxSelector, keyword);
            // 按回车键搜索
            await this.page.keyboard.press("Enter");

            // 等待页面完全加载
            await this.page.waitForTimeout(2000);


            // 获取页面 URL
            this.capturedData.url = this.page.url();
            console.log('当前 URL:', this.capturedData.url);

            // 获取 cookies
            const cookies = await this.context.cookies();
            this.capturedData.cookies = cookies;
            console.log('获取到的 Cookies:', cookies.length, '个');
            console.log(cookies);

            // 获取 headers
            this.capturedData.headers = await headersPromise;
            console.log('获取到的 Headers:', Object.keys(this.capturedData.headers).length, '个');
            console.log(this.capturedData.headers);

            return this.capturedData;

        } catch (error) {
            console.error('捕获数据时出错:', error);
            throw error;
        }
    }

    async captureHeaders() {
        return new Promise((resolve) => {
            const headers = {};

            // 监听所有网络请求
            this.page.on('request', (request) => {
                const requestHeaders = request.headers();

                // 只记录主要的请求头
                if (request.url().includes('google.com')) {
                    Object.assign(headers, requestHeaders);
                }
            });

            // 3秒后返回收集到的 headers
            setTimeout(() => {
                resolve(headers);
            }, 3000);
        });
    }

    // 构建 Cookie 字符串
    buildCookieString() {
        return this.capturedData.cookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');
    }

    // 使用 Node.js 内置 http/https 模块发送请求
    async makeHttpRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const lib = isHttps ? https : http;

            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    ...this.capturedData.headers,
                    ...options.headers
                }
            };

            // 添加 cookies
            if (this.capturedData.cookies.length > 0) {
                requestOptions.headers['Cookie'] = this.buildCookieString();
            }

            console.log('发送请求到:', url);
            console.log('请求头:', requestOptions.headers);

            const req = lib.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const result = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    };
                    resolve(result);
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    // 使用 fetch API 发送请求（Node.js 18+）
    async makeFetchRequest(url, options = {}) {
        const fetch = await import('node-fetch').then(module => module.default);

        const requestOptions = {
            method: 'GET',
            headers: {
                ...this.capturedData.headers,
                ...options.headers
            }
        };

        // 添加 cookies
        if (this.capturedData.cookies.length > 0) {
            requestOptions.headers['Cookie'] = this.buildCookieString();
        }

        console.log('使用 fetch 发送请求到:', url);

        const response = await fetch(url, requestOptions);
        const data = await response.text();

        return {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers),
            data: data
        };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// 使用示例
async function main() {
    const manager = new BrowserRequestManager();

    try {
        // 初始化浏览器
        await manager.init();

        // 捕获 Google 数据
        const capturedData = await manager.captureGoogleData();

        console.log('\n=== 捕获的数据 ===');
        console.log('URL:', capturedData.url);
        console.log('Cookies 数量:', capturedData.cookies.length);
        console.log('Headers 数量:', Object.keys(capturedData.headers).length);

        // 使用捕获的数据发送 HTTP 请求
        console.log('\n=== 发送 HTTP 请求 ===');

        let successCount = 0;
        // 解析 capturedData.url 中的域名
        const parsedUrl = new URL(capturedData.url);

        while (true) {
            // 生成随机搜索词
            const keyword = faker.word.sample();
            // 方法1: 使用 Node.js 内置模块
            parsedUrl.searchParams.set('q', keyword);
            const result1 = await manager.makeHttpRequest(parsedUrl.toString());
            console.log('HTTP 请求结果 - 状态码:', result1.statusCode);
            console.log('响应头:', result1.headers);
            console.log('数据长度:', result1.data.length);
            if (result1.statusCode === 200 && result1.data.length > 10000) {
                successCount++;
                console.log('成功次数:', successCount);
                // 停顿 1 秒
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
            } else {
                fs.appendFile('fail.txt', result1.data, 'utf8', (err) => {
                    if (err) {
                        console.error('追加内容时发生错误:', err);
                        return;
                    }
                    console.log('内容已追加到文件！');
                });
                console.log('成功次数:', successCount);
                break;
            }
        }

        // 方法2: 使用 fetch (Node.js 18+)
        // const result2 = await manager.makeFetchRequest('https://www.google.com');
        // console.log('Fetch 请求结果 - 状态码:', result2.statusCode);

    } catch (error) {
        console.error('执行过程中出错:', error);
    } finally {
        // 关闭浏览器
        await manager.close();
    }
}

// 运行示例
if (require.main === module) {
    main();
}

module.exports = BrowserRequestManager;