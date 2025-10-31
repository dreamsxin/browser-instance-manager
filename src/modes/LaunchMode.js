import BaseMode from './BaseMode.js';
import { createLogger } from '../utils/logger.js';

export class LaunchMode extends BaseMode {
  constructor(browser, options = {}) {
    super(browser, options);
    this.launchTime = null;
  }

  async launch() {
    this.validateOptions(this.options);
    
    this.logger.info('Launching browser in direct mode...');
    const startTime = Date.now();
    
    try {
      this.browserInstance = await this.browser.launch(this.options);
      this.isLaunched = true;
      this.launchTime = Date.now() - startTime;
      
      this.logger.info(`Browser launched successfully in ${this.launchTime}ms`);
      return this.browserInstance;
    } catch (error) {
      this.logger.error('Failed to launch browser:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isLaunched || !this.browserInstance) {
      return;
    }

    try {
      await this.browserInstance.close();
      this.isLaunched = false;
      this.browserInstance = null;
      this.logger.info('Browser stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping browser:', error);
      throw error;
    }
  }

  getRequiredOptions() {
    return ['headless'];
  }

  getMetrics() {
    return {
      ...super.getMetrics(),
      mode: 'launch',
      launchTime: this.launchTime
    };
  }
}

export default LaunchMode;