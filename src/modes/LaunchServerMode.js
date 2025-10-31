import BaseMode from './BaseMode.js';
import { createLogger } from '../utils/logger.js';

export class LaunchServerMode extends BaseMode {
  constructor(browser, options = {}) {
    super(browser, options);
    this.server = null;
    this.wsEndpoint = null;
    this.launchTime = null;
  }

  async launch() {
    this.validateOptions(this.options);
    
    this.logger.info('Launching browser server...');
    const startTime = Date.now();
    
    try {
      // 启动浏览器服务器
      this.server = await this.browser.launchServer(this.options);
      this.wsEndpoint = this.server.wsEndpoint();
      
      // 连接到服务器
      this.browserInstance = await this.browser.connect(this.wsEndpoint);
      this.isLaunched = true;
      this.launchTime = Date.now() - startTime;
      
      this.logger.info(`Browser server launched successfully in ${this.launchTime}ms`);
      this.logger.debug(`WebSocket endpoint: ${this.wsEndpoint}`);
      
      return this.browserInstance;
    } catch (error) {
      this.logger.error('Failed to launch browser server:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isLaunched) {
      return;
    }

    try {
      // 断开连接
      if (this.browserInstance) {
        await this.browserInstance.close();
        this.browserInstance = null;
      }
      
      // 关闭服务器
      if (this.server) {
        await this.server.close();
        this.server = null;
      }
      
      this.isLaunched = false;
      this.wsEndpoint = null;
      this.logger.info('Browser server stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping browser server:', error);
      throw error;
    }
  }

  getWsEndpoint() {
    return this.wsEndpoint;
  }

  getRequiredOptions() {
    return ['headless'];
  }

  getMetrics() {
    return {
      ...super.getMetrics(),
      mode: 'launchServer',
      launchTime: this.launchTime,
      wsEndpoint: this.wsEndpoint
    };
  }
}

export default LaunchServerMode;