import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

export class HealthMonitor extends EventEmitter {
  constructor(browserManager) {
    super();
    this.browserManager = browserManager;
    this.logger = createLogger(browserManager.config.logLevel);
    this.monitoredInstances = new Map();
    this.healthCheckInterval = browserManager.config.healthCheckInterval || 30000;
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
    
    this.logger.info('Health monitor started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.monitoredInstances.clear();
    this.logger.info('Health monitor stopped');
  }

  monitorInstance(instanceId) {
    this.monitoredInstances.set(instanceId, {
      instanceId,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0,
      isHealthy: true
    });
    
    if (!this.intervalId) {
      this.start();
    }
  }

  stopMonitoring(instanceId) {
    this.monitoredInstances.delete(instanceId);
  }

  async performHealthChecks() {
    for (const [instanceId, healthInfo] of this.monitoredInstances) {
      try {
        const isHealthy = await this.checkInstanceHealth(instanceId);
        
        if (isHealthy) {
          healthInfo.consecutiveFailures = 0;
          if (!healthInfo.isHealthy) {
            healthInfo.isHealthy = true;
            this.emit('instanceRecovered', instanceId);
            this.logger.info(`Instance ${instanceId} recovered`);
          }
        } else {
          healthInfo.consecutiveFailures++;
          this.logger.warn(`Health check failed for instance ${instanceId}, failures: ${healthInfo.consecutiveFailures}`);
          
          if (healthInfo.consecutiveFailures >= 3) {
            healthInfo.isHealthy = false;
            this.emit('instanceUnhealthy', instanceId);
          }
        }
        
        healthInfo.lastHealthCheck = new Date();
      } catch (error) {
        this.logger.error(`Health check error for instance ${instanceId}:`, error);
        healthInfo.consecutiveFailures++;
      }
    }
  }

  async checkInstanceHealth(instanceId) {
    const instance = this.browserManager.getInstance(instanceId);
    if (!instance) return false;

    // 检查浏览器是否连接
    if (!instance.browser.isConnected()) {
      return false;
    }

    // 检查浏览器是否已经关闭
    if (instance.status !== 'running') {
      return false;
    }

    // 尝试创建一个测试页面来验证功能
    try {
      const context = await instance.browser.newContext();
      const page = await context.newPage();
      
      // 设置超时
      await Promise.race([
        page.goto('about:blank'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);
      
      await context.close();
      return true;
    } catch (error) {
      return false;
    }
  }

  getInstanceHealth(instanceId) {
    return this.monitoredInstances.get(instanceId) || null;
  }

  getOverallHealth() {
    const instances = Array.from(this.monitoredInstances.values());
    if (instances.length === 0) return 'unknown';
    
    const healthyCount = instances.filter(inst => inst.isHealthy).length;
    const healthPercentage = (healthyCount / instances.length) * 100;
    
    if (healthPercentage >= 90) return 'excellent';
    if (healthPercentage >= 75) return 'good';
    if (healthPercentage >= 50) return 'fair';
    return 'poor';
  }

  getHealthReport() {
    const report = {
      timestamp: new Date(),
      overallHealth: this.getOverallHealth(),
      instances: {}
    };

    for (const [instanceId, healthInfo] of this.monitoredInstances) {
      report.instances[instanceId] = {
        isHealthy: healthInfo.isHealthy,
        lastHealthCheck: healthInfo.lastHealthCheck,
        consecutiveFailures: healthInfo.consecutiveFailures
      };
    }

    return report;
  }
}

export default HealthMonitor;