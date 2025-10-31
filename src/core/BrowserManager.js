import { EventEmitter } from 'events';
import { LaunchMode, LaunchServerMode } from '../modes/index.js';
import { BrowserFactory } from '../browsers/BrowserFactory.js';
import { InstancePool } from './InstancePool.js';
import { HealthMonitor } from './HealthMonitor.js';
import { createLogger } from '../utils/logger.js';
import { BrowserInstanceError, ValidationError } from '../utils/errors.js';
import { DEFAULT_CONFIG, MODES, BROWSER_TYPES } from '../utils/constants.js';

export class BrowserManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger(this.config.logLevel);
    this.instancePool = new InstancePool(this.config);
    this.healthMonitor = new HealthMonitor(this);
    this.browserFactory = new BrowserFactory();
    
    this.instances = new Map();
    this.isShuttingDown = false;
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.on('instanceCreated', (instanceId) => {
      this.logger.info(`Browser instance created: ${instanceId}`);
    });

    this.on('instanceStopped', (instanceId) => {
      this.logger.info(`Browser instance stopped: ${instanceId}`);
    });

    this.on('instanceError', (instanceId, error) => {
      this.logger.error(`Instance ${instanceId} error:`, error);
    });

    // 健康监控事件
    this.healthMonitor.on('instanceUnhealthy', (instanceId) => {
      this.logger.warn(`Instance ${instanceId} is unhealthy, attempting recovery...`);
      this.recoverInstance(instanceId);
    });
  }

  async launch(instanceId, options = {}) {
    this.validateInstanceId(instanceId);
    
    if (this.instances.has(instanceId)) {
      throw new BrowserInstanceError(`Instance already exists: ${instanceId}`);
    }

    if (this.instancePool.isFull()) {
      throw new BrowserInstanceError('Maximum instance limit reached');
    }

    try {
      const browserType = options.browser || this.config.defaultBrowser;
      const mode = options.mode || this.config.defaultMode;
      
      const modeHandler = this.createModeHandler(mode, options);
      const browser = await modeHandler.launch();

      const instanceInfo = {
        id: instanceId,
        browser,
        mode: modeHandler,
        browserType,
        status: 'running',
        launchTime: new Date(),
        lastActivity: new Date(),
        options,
        metrics: {
          pagesCreated: 0,
          requestsMade: 0,
          errors: 0
        }
      };

      this.instances.set(instanceId, instanceInfo);
      this.instancePool.addInstance(instanceId);
      
      this.setupInstanceEventHandlers(instanceId, browser);
      this.healthMonitor.monitorInstance(instanceId);

      this.emit('instanceCreated', instanceId);
      return instanceInfo;

    } catch (error) {
      this.emit('instanceError', instanceId, error);
      throw new BrowserInstanceError(`Failed to launch instance ${instanceId}: ${error.message}`);
    }
  }

  createModeHandler(mode, options) {
    const browserType = options.browser || this.config.defaultBrowser;
    const browser = this.browserFactory.createBrowser(browserType, options);
    
    switch (mode) {
      case MODES.LAUNCH:
        return new LaunchMode(browser, options);
      case MODES.LAUNCH_SERVER:
        return new LaunchServerMode(browser, options);
      default:
        throw new ValidationError(`Unsupported mode: ${mode}`);
    }
  }

  setupInstanceEventHandlers(instanceId, browser) {
    browser.on('disconnected', () => {
      this.handleInstanceDisconnected(instanceId);
    });

    // 监听页面创建
    browser.on('page', (page) => {
      const instance = this.instances.get(instanceId);
      if (instance) {
        instance.metrics.pagesCreated++;
        instance.lastActivity = new Date();
      }
    });
  }

  handleInstanceDisconnected(instanceId) {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'disconnected';
      this.logger.warn(`Instance disconnected: ${instanceId}`);
      this.emit('instanceDisconnected', instanceId);
    }
  }

  async stop(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new BrowserInstanceError(`Instance not found: ${instanceId}`);
    }

    try {
      await instance.mode.stop();
      this.instances.delete(instanceId);
      this.instancePool.removeInstance(instanceId);
      this.healthMonitor.stopMonitoring(instanceId);
      
      this.emit('instanceStopped', instanceId);
      return true;
    } catch (error) {
      this.emit('instanceError', instanceId, error);
      throw new BrowserInstanceError(`Failed to stop instance ${instanceId}: ${error.message}`);
    }
  }

  async stopAll() {
    this.logger.info('Stopping all browser instances...');
    
    const stopPromises = Array.from(this.instances.keys()).map(instanceId =>
      this.stop(instanceId).catch(error => {
        this.logger.error(`Error stopping instance ${instanceId}:`, error);
      })
    );

    await Promise.allSettled(stopPromises);
    this.logger.info('All browser instances stopped');
  }

  async newPage(instanceId, contextOptions = {}) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new BrowserInstanceError(`Instance not found: ${instanceId}`);
    }

    if (instance.status !== 'running') {
      throw new BrowserInstanceError(`Instance not running: ${instanceId}`);
    }

    try {
      const context = await instance.browser.newContext(contextOptions);
      const page = await context.newPage();
      
      // 更新活动时间
      instance.lastActivity = new Date();
      
      return { page, context, instanceId };
    } catch (error) {
      instance.metrics.errors++;
      throw new BrowserInstanceError(`Failed to create page: ${error.message}`);
    }
  }

  async recoverInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    try {
      this.logger.info(`Attempting to recover instance: ${instanceId}`);
      await this.stop(instanceId);
      
      // 重新启动实例
      const newInstance = await this.launch(instanceId, instance.options);
      this.logger.info(`Instance recovered successfully: ${instanceId}`);
      return newInstance;
    } catch (error) {
      this.logger.error(`Failed to recover instance ${instanceId}:`, error);
      return false;
    }
  }

  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  getAllInstances() {
    return Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      browserType: instance.browserType,
      mode: instance.mode.constructor.name,
      status: instance.status,
      launchTime: instance.launchTime,
      lastActivity: instance.lastActivity,
      metrics: instance.metrics
    }));
  }

  getStatus() {
    const instances = Array.from(this.instances.values());
    const running = instances.filter(i => i.status === 'running').length;
    
    return {
      totalInstances: instances.length,
      runningInstances: running,
      maxInstances: this.config.maxInstances,
      health: this.healthMonitor.getOverallHealth()
    };
  }

  validateInstanceId(instanceId) {
    if (!instanceId || typeof instanceId !== 'string') {
      throw new ValidationError('Instance ID must be a non-empty string');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(instanceId)) {
      throw new ValidationError('Instance ID can only contain letters, numbers, underscores and hyphens');
    }
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Shutting down browser manager...');
    
    await this.healthMonitor.stop();
    await this.stopAll();
    
    this.logger.info('Browser manager shutdown complete');
  }
}

export default BrowserManager;