import { chromium, firefox, webkit } from 'playwright';
import { createLogger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { BROWSER_TYPES, DEFAULT_BROWSER_OPTIONS } from '../utils/constants.js';

export class BrowserFactory {
  constructor() {
    this.logger = createLogger();
    this.browsers = new Map([
      [BROWSER_TYPES.CHROMIUM, chromium],
      [BROWSER_TYPES.FIREFOX, firefox],
      [BROWSER_TYPES.WEBKIT, webkit]
    ]);
  }

  createBrowser(browserType, options = {}) {
    const browser = this.browsers.get(browserType);
    if (!browser) {
      throw new ValidationError(`Unsupported browser type: ${browserType}`);
    }

    const browserOptions = {
      ...DEFAULT_BROWSER_OPTIONS[browserType],
      ...options
    };

    this.logger.debug(`Creating browser: ${browserType}`, browserOptions);

    return {
      type: browserType,
      launcher: browser,
      options: browserOptions,
      
      launch: async (launchOptions = {}) => {
        const finalOptions = { ...browserOptions, ...launchOptions };
        return await browser.launch(finalOptions);
      },
      
      launchServer: async (launchOptions = {}) => {
        const finalOptions = { ...browserOptions, ...launchOptions };
        return await browser.launchServer(finalOptions);
      },
      
      connect: async (wsEndpoint, connectOptions = {}) => {
        return await browser.connect(wsEndpoint, connectOptions);
      }
    };
  }

  getSupportedBrowsers() {
    return Array.from(this.browsers.keys());
  }

  validateBrowserType(browserType) {
    if (!this.browsers.has(browserType)) {
      throw new ValidationError(
        `Unsupported browser type: ${browserType}. Supported: ${this.getSupportedBrowsers().join(', ')}`
      );
    }
    return true;
  }

  getDefaultOptions(browserType) {
    this.validateBrowserType(browserType);
    return { ...DEFAULT_BROWSER_OPTIONS[browserType] };
  }

  createAllBrowsers(options = {}) {
    const browsers = {};
    for (const browserType of this.getSupportedBrowsers()) {
      browsers[browserType] = this.createBrowser(browserType, options);
    }
    return browsers;
  }
}

// 导出浏览器类型常量
export const BrowserType = {
  CHROMIUM: BROWSER_TYPES.CHROMIUM,
  FIREFOX: BROWSER_TYPES.FIREFOX,
  WEBKIT: BROWSER_TYPES.WEBKIT
};

export default BrowserFactory;