import { EventEmitter } from 'events';
import { createLogger } from './logger.js';
import { formatBytes, formatDuration, generatePerformanceReport } from './helpers.js';

const logger = createLogger();

export class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.startTime = Date.now();
    this.logger = logger.child('Metrics');
  }

  /**
   * 记录指标
   * @param {string} instanceId 实例ID
   * @param {string} metric 指标名称
   * @param {*} value 指标值
   */
  record(instanceId, metric, value) {
    if (!this.metrics.has(instanceId)) {
      this.metrics.set(instanceId, {
        instanceId,
        launchTime: null,
        pagesCreated: 0,
        pagesClosed: 0,
        requestsMade: 0,
        requestsFailed: 0,
        errors: 0,
        totalMemory: 0,
        averageResponseTime: 0,
        lastActivity: null,
        performance: {
          launchTimes: [],
          pageCreationTimes: [],
          requestTimes: []
        }
      });
    }

    const instanceMetrics = this.metrics.get(instanceId);

    switch (metric) {
      case 'launch':
        instanceMetrics.launchTime = value;
        instanceMetrics.performance.launchTimes.push(value);
        break;

      case 'pageCreated':
        instanceMetrics.pagesCreated += value || 1;
        break;

      case 'pageClosed':
        instanceMetrics.pagesClosed += value || 1;
        break;

      case 'request':
        instanceMetrics.requestsMade += value || 1;
        break;

      case 'requestFailed':
        instanceMetrics.requestsFailed += value || 1;
        break;

      case 'error':
        instanceMetrics.errors += value || 1;
        break;

      case 'memory':
        instanceMetrics.totalMemory = value;
        break;

      case 'responseTime':
        const responseTime = value || 0;
        // 简单移动平均
        instanceMetrics.averageResponseTime = 
          (instanceMetrics.averageResponseTime * instanceMetrics.requestsMade + responseTime) / 
          (instanceMetrics.requestsMade + 1);
        instanceMetrics.performance.requestTimes.push(responseTime);
        break;

      case 'pageCreationTime':
        instanceMetrics.performance.pageCreationTimes.push(value);
        break;

      case 'activity':
        instanceMetrics.lastActivity = value || new Date();
        break;
    }

    this.logger.debug(`Metrics updated for ${instanceId}: ${metric} = ${value}`);
    this.emit('metricsUpdated', instanceId, metric, value);
  }

  /**
   * 获取实例指标
   * @param {string} instanceId 实例ID
   * @returns {object|null}
   */
  get(instanceId) {
    return this.metrics.get(instanceId) || null;
  }

  /**
   * 获取所有实例指标
   * @returns {Array}
   */
  getAll() {
    return Array.from(this.metrics.values());
  }

  /**
   * 获取汇总统计
   * @returns {object}
   */
  getSummary() {
    const instances = this.getAll();
    const summary = {
      totalInstances: instances.length,
      totalPagesCreated: 0,
      totalPagesClosed: 0,
      totalRequestsMade: 0,
      totalRequestsFailed: 0,
      totalErrors: 0,
      averageLaunchTime: 0,
      averageResponseTime: 0,
      errorRate: 0,
      uptime: Date.now() - this.startTime,
      memoryUsage: this.getMemoryUsage()
    };

    if (instances.length > 0) {
      let totalLaunchTime = 0;
      let totalResponseTime = 0;
      let instancesWithLaunchTime = 0;
      let instancesWithRequests = 0;

      instances.forEach(instance => {
        summary.totalPagesCreated += instance.pagesCreated;
        summary.totalPagesClosed += instance.pagesClosed;
        summary.totalRequestsMade += instance.requestsMade;
        summary.totalRequestsFailed += instance.requestsFailed;
        summary.totalErrors += instance.errors;

        if (instance.launchTime) {
          totalLaunchTime += instance.launchTime;
          instancesWithLaunchTime++;
        }

        if (instance.requestsMade > 0) {
          totalResponseTime += instance.averageResponseTime * instance.requestsMade;
          instancesWithRequests++;
        }
      });

      summary.averageLaunchTime = instancesWithLaunchTime > 0 ? totalLaunchTime / instancesWithLaunchTime : 0;
      summary.averageResponseTime = instancesWithRequests > 0 ? totalResponseTime / summary.totalRequestsMade : 0;
      summary.errorRate = summary.totalRequestsMade > 0 ? 
        (summary.totalErrors / summary.totalRequestsMade) * 100 : 0;
    }

    return summary;
  }

  /**
   * 获取性能报告
   * @returns {object}
   */
  getPerformanceReport() {
    const instances = this.getAll();
    const allLaunchTimes = [];
    const allPageCreationTimes = [];
    const allRequestTimes = [];

    instances.forEach(instance => {
      allLaunchTimes.push(...instance.performance.launchTimes);
      allPageCreationTimes.push(...instance.performance.pageCreationTimes);
      allRequestTimes.push(...instance.performance.requestTimes);
    });

    return {
      launch: generatePerformanceReport(allLaunchTimes),
      pageCreation: generatePerformanceReport(allPageCreationTimes),
      requests: generatePerformanceReport(allRequestTimes),
      instances: instances.length
    };
  }

  /**
   * 获取内存使用情况
   * @returns {object}
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external
      };
    }
    return {};
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics.clear();
    this.startTime = Date.now();
    this.logger.info('Metrics reset');
    this.emit('metricsReset');
  }

  /**
   * 移除实例指标
   * @param {string} instanceId 实例ID
   */
  remove(instanceId) {
    this.metrics.delete(instanceId);
    this.logger.debug(`Metrics removed for instance: ${instanceId}`);
    this.emit('metricsRemoved', instanceId);
  }

  /**
   * 生成可读的报告
   * @returns {string}
   */
  generateReadableReport() {
    const summary = this.getSummary();
    const performance = this.getPerformanceReport();

    return `
Browser Instance Manager - Metrics Report
=========================================

Summary:
--------
- Total Instances: ${summary.totalInstances}
- Total Pages Created: ${summary.totalPagesCreated}
- Total Requests: ${summary.totalRequestsMade}
- Error Rate: ${summary.errorRate.toFixed(2)}%
- Uptime: ${formatDuration(summary.uptime)}

Performance:
------------
- Average Launch Time: ${performance.launch.average.toFixed(2)}ms
- Average Page Creation Time: ${performance.pageCreation.average.toFixed(2)}ms
- Average Request Time: ${performance.requests.average.toFixed(2)}ms

Memory Usage:
-------------
- RSS: ${formatBytes(summary.memoryUsage.rss || 0)}
- Heap Total: ${formatBytes(summary.memoryUsage.heapTotal || 0)}
- Heap Used: ${formatBytes(summary.memoryUsage.heapUsed || 0)}
- External: ${formatBytes(summary.memoryUsage.external || 0)}
    `.trim();
  }
}

// 创建全局指标收集器
const globalMetrics = new MetricsCollector();

/**
 * 获取全局指标收集器
 * @returns {MetricsCollector}
 */
export function getMetricsCollector() {
  return globalMetrics;
}

export default MetricsCollector;