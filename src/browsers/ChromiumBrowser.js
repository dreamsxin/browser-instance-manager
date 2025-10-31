import { createLogger } from '../utils/logger.js';

export class ChromiumBrowser {
  static DEFAULT_OPTIONS = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-back-forward-cache',
      '--disable-ipc-flooding-protection'
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    timeout: 30000
  };

  constructor(options = {}) {
    this.logger = createLogger();
    this.options = { ...ChromiumBrowser.DEFAULT_OPTIONS, ...options };
  }

  async launch() {
    const { chromium } = await import('playwright');
    this.logger.info('Launching Chromium browser...');
    return await chromium.launch(this.options);
  }

  async launchServer() {
    const { chromium } = await import('playwright');
    this.logger.info('Launching Chromium browser server...');
    return await chromium.launchServer(this.options);
  }

  static getPerformanceArgs() {
    return [
      '--aggressive-cache-discard',
      '--max_old_space_size=4096',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];
  }

  static getStealthArgs() {
    return [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=UserAgentClientHint',
      '--disable-webrtc-hide-local-ips-with-mdns',
      '--disable-webrtc-multiple-routes',
      '--disable-webrtc-hw-decoding',
      '--disable-webrtc-hw-encoding'
    ];
  }

  static createForScraping(options = {}) {
    const scrapingOptions = {
      headless: true,
      args: [
        ...ChromiumBrowser.DEFAULT_OPTIONS.args,
        ...ChromiumBrowser.getStealthArgs(),
        '--disable-javascript-harmony-shipping',
        '--disable-back-forward-cache'
      ],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    };

    return new ChromiumBrowser({ ...scrapingOptions, ...options });
  }

  static createForTesting(options = {}) {
    const testingOptions = {
      headless: process.env.CI ? true : false,
      devtools: !process.env.CI,
      slowMo: process.env.CI ? 0 : 50,
      args: [
        ...ChromiumBrowser.DEFAULT_OPTIONS.args,
        '--disable-web-security',
        '--allow-running-insecure-content'
      ],
      viewport: { width: 1280, height: 720 }
    };

    return new ChromiumBrowser({ ...testingOptions, ...options });
  }
}

export default ChromiumBrowser;