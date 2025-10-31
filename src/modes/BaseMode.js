import { createLogger } from '../utils/logger.js';

export class BaseMode {
  constructor(browser, options = {}) {
    this.browser = browser;
    this.options = options;
    this.logger = createLogger(options.logLevel || 'info');
    this.isLaunched = false;
  }

  async launch() {
    throw new Error('launch method must be implemented by subclass');
  }

  async stop() {
    throw new Error('stop method must be implemented by subclass');
  }

  async createContext(options = {}) {
    if (!this.isLaunched) {
      throw new Error('Browser not launched');
    }
    return await this.browser.newContext(options);
  }

  async createPage(contextOptions = {}) {
    const context = await this.createContext(contextOptions);
    const page = await context.newPage();
    return { page, context };
  }

  validateOptions(options) {
    const required = this.getRequiredOptions();
    const missing = required.filter(key => options[key] == null);
    
    if (missing.length > 0) {
      throw new Error(`Missing required options: ${missing.join(', ')}`);
    }
  }

  getRequiredOptions() {
    return [];
  }

  getMetrics() {
    return {
      launchTime: this.launchTime,
      isLaunched: this.isLaunched
    };
  }
}

export default BaseMode;