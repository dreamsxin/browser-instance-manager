import { createLogger } from '../utils/logger.js';

export class WebKitBrowser {
  static DEFAULT_OPTIONS = {
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-startup-window'
    ],
    timeout: 30000
  };

  constructor(options = {}) {
    this.logger = createLogger();
    this.options = { ...WebKitBrowser.DEFAULT_OPTIONS, ...options };
  }

  async launch() {
    const { webkit } = await import('playwright');
    this.logger.info('Launching WebKit browser...');
    return await webkit.launch(this.options);
  }

  async launchServer() {
    const { webkit } = await import('playwright');
    this.logger.info('Launching WebKit browser server...');
    return await webkit.launchServer(this.options);
  }

  static getSafariLikeArgs() {
    return [
      '--disable-features=TranslateUI',
      '--disable-component-extensions-with-background-pages'
    ];
  }

  static createForMobile(options = {}) {
    const mobileOptions = {
      headless: true,
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    };

    return new WebKitBrowser({ ...mobileOptions, ...options });
  }

  static createForDesktop(options = {}) {
    const desktopOptions = {
      headless: true,
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15'
    };

    return new WebKitBrowser({ ...desktopOptions, ...options });
  }
}

export default WebKitBrowser;