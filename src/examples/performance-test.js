import BrowserManager from '../core/BrowserManager.js';
import { getPreset } from '../config/presets.js';
import { createLogger, getMetricsCollector } from '../utils/index.js';

const logger = createLogger({ level: 'info' });
const metrics = getMetricsCollector();

/**
 * 性能压力测试
 */
class PerformanceTester {
  constructor() {
    this.manager = new BrowserManager({
      maxInstances: 10,
      logLevel: 'warn',
      healthCheckInterval: 15000
    });
    
    this.results = {
      launchTimes: [],
      pageCreationTimes: [],
      concurrentTests: [],
      memoryUsage: []
    };
  }

  /**
   * 单个实例启动性能测试
   */
  async testSingleInstanceLaunch() {
    logger.info('=== 单个实例启动性能测试 ===');
    
    const iterations = 5;
    const launchTimes = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const instance = await this.manager.launch(`single-test-${i}`, {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      const launchTime = Date.now() - startTime;
      launchTimes.push(launchTime);
      
      metrics.record(`single-test-${i}`, 'launch', launchTime);
      logger.info(`迭代 ${i + 1}: 启动时间 ${launchTime}ms`);

      await this.manager.stop(`single-test-${i}`);
    }

    const average = launchTimes.reduce((a, b) => a + b) / launchTimes.length;
    logger.info(`平均启动时间: ${average.toFixed(2)}ms`);
    
    this.results.launchTimes = launchTimes;
    return launchTimes;
  }

  /**
   * 页面创建性能测试
   */
  async testPageCreation() {
    logger.info('\n=== 页面创建性能测试 ===');
    
    await this.manager.launch('page-test', {
      mode: 'launchServer',
      browser: 'chromium',
      options: { headless: true }
    });

    const iterations = 10;
    const creationTimes = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const { page, context } = await this.manager.newPage('page-test');
      await page.goto('about:blank');
      await page.waitForTimeout(10);
      
      const creationTime = Date.now() - startTime;
      creationTimes.push(creationTime);
      
      metrics.record('page-test', 'pageCreationTime', creationTime);
      logger.info(`页面 ${i + 1}: 创建时间 ${creationTime}ms`);

      await context.close();
    }

    await this.manager.stop('page-test');

    const average = creationTimes.reduce((a, b) => a + b) / creationTimes.length;
    logger.info(`平均页面创建时间: ${average.toFixed(2)}ms`);
    
    this.results.pageCreationTimes = creationTimes;
    return creationTimes;
  }

  /**
   * 并发测试
   */
  async testConcurrency() {
    logger.info('\n=== 并发性能测试 ===');
    
    const concurrentLevels = [1, 3, 5];
    const concurrentResults = [];

    for (const level of concurrentLevels) {
      logger.info(`测试并发级别: ${level} 个实例`);
      
      const startTime = Date.now();
      const promises = [];

      // 创建并发实例
      for (let i = 0; i < level; i++) {
        const promise = this.manager.launch(`concurrent-${level}-${i}`, {
          mode: 'launch',
          browser: 'chromium',
          options: { headless: true }
        }).then(async (instance) => {
          // 每个实例执行一些操作
          const { page, context } = await this.manager.newPage(`concurrent-${level}-${i}`);
          await page.goto('https://httpbin.org/delay/1'); // 延迟1秒的请求
          await context.close();
          return instance;
        });
        
        promises.push(promise);
      }

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      concurrentResults.push({
        level,
        totalTime,
        averageTime: totalTime / level
      });

      logger.info(`并发级别 ${level}: 总时间 ${totalTime}ms, 平均 ${(totalTime / level).toFixed(2)}ms/实例`);

      // 清理实例
      for (let i = 0; i < level; i++) {
        await this.manager.stop(`concurrent-${level}-${i}`);
      }
    }

    this.results.concurrentTests = concurrentResults;
    return concurrentResults;
  }

  /**
   * 内存使用测试
   */
  async testMemoryUsage() {
    logger.info('\n=== 内存使用测试 ===');
    
    const memoryReadings = [];
    const instanceCount = 5;

    // 记录初始内存
    const initialMemory = process.memoryUsage();
    memoryReadings.push({ stage: '初始', ...initialMemory });

    // 创建多个实例
    for (let i = 0; i < instanceCount; i++) {
      await this.manager.launch(`memory-test-${i}`, {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      const memory = process.memoryUsage();
      memoryReadings.push({ 
        stage: `实例 ${i + 1}`, 
        ...memory 
      });

      logger.info(`创建实例 ${i + 1}: RSS=${this.formatBytes(memory.rss)}, 堆=${this.formatBytes(memory.heapUsed)}`);
    }

    // 清理所有实例
    await this.manager.stopAll();
    
    const finalMemory = process.memoryUsage();
    memoryReadings.push({ stage: '清理后', ...finalMemory });

    this.results.memoryUsage = memoryReadings;
    return memoryReadings;
  }

  /**
   * 不同预设配置的性能测试
   */
  async testPresetsPerformance() {
    logger.info('\n=== 预设配置性能测试 ===');
    
    const presets = ['scraping', 'testing', 'headless_minimal'];
    const presetResults = [];

    for (const presetName of presets) {
      logger.info(`测试预设: ${presetName}`);
      
      const startTime = Date.now();
      
      const preset = getPreset(presetName);
      const instance = await this.manager.launch(`preset-${presetName}`, preset);
      
      const launchTime = Date.now() - startTime;
      
      // 测试页面加载性能
      const pageStartTime = Date.now();
      const { page, context } = await this.manager.newPage(`preset-${presetName}`);
      await page.goto('https://httpbin.org/html');
      const pageLoadTime = Date.now() - pageStartTime;
      
      await context.close();
      await this.manager.stop(`preset-${presetName}`);

      presetResults.push({
        preset: presetName,
        launchTime,
        pageLoadTime,
        mode: preset.mode,
        browser: preset.browser
      });

      logger.info(`预设 ${presetName}: 启动 ${launchTime}ms, 页面加载 ${pageLoadTime}ms`);
    }

    return presetResults;
  }

  /**
   * 生成性能报告
   */
  generateReport() {
    logger.info('\n=== 性能测试报告 ===');
    
    // 单个实例启动性能
    if (this.results.launchTimes.length > 0) {
      const launchAvg = this.results.launchTimes.reduce((a, b) => a + b) / this.results.launchTimes.length;
      const launchMin = Math.min(...this.results.launchTimes);
      const launchMax = Math.max(...this.results.launchTimes);
      
      logger.info('单个实例启动性能:');
      logger.info(`  平均: ${launchAvg.toFixed(2)}ms, 最小: ${launchMin}ms, 最大: ${launchMax}ms`);
    }

    // 页面创建性能
    if (this.results.pageCreationTimes.length > 0) {
      const pageAvg = this.results.pageCreationTimes.reduce((a, b) => a + b) / this.results.pageCreationTimes.length;
      const pageMin = Math.min(...this.results.pageCreationTimes);
      const pageMax = Math.max(...this.results.pageCreationTimes);
      
      logger.info('页面创建性能:');
      logger.info(`  平均: ${pageAvg.toFixed(2)}ms, 最小: ${pageMin}ms, 最大: ${pageMax}ms`);
    }

    // 并发性能
    if (this.results.concurrentTests.length > 0) {
      logger.info('并发性能:');
      this.results.concurrentTests.forEach(result => {
        logger.info(`  并发 ${result.level}: 总时间 ${result.totalTime}ms, 平均 ${result.averageTime.toFixed(2)}ms/实例`);
      });
    }

    // 内存使用
    if (this.results.memoryUsage.length > 0) {
      logger.info('内存使用变化:');
      this.results.memoryUsage.forEach(reading => {
        logger.info(`  ${reading.stage}: RSS=${this.formatBytes(reading.rss)}, 堆=${this.formatBytes(reading.heapUsed)}`);
      });
    }

    // 全局指标
    const metricsSummary = metrics.getSummary();
    logger.info('\n全局指标:');
    logger.info(`  总实例数: ${metricsSummary.totalInstances}`);
    logger.info(`  总页面创建: ${metricsSummary.totalPagesCreated}`);
    logger.info(`  总请求数: ${metricsSummary.totalRequestsMade}`);
    logger.info(`  错误率: ${metricsSummary.errorRate.toFixed(2)}%`);
    logger.info(`  运行时间: ${this.formatDuration(metricsSummary.uptime)}`);
  }

  /**
   * 格式化字节大小
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化时间间隔
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    try {
      await this.testSingleInstanceLaunch();
      await this.testPageCreation();
      await this.testConcurrency();
      await this.testMemoryUsage();
      await this.testPresetsPerformance();
      
      this.generateReport();
      
    } catch (error) {
      logger.error('性能测试失败:', error);
    } finally {
      await this.manager.shutdown();
    }
  }
}

// 运行性能测试
async function runPerformanceTests() {
  logger.info('开始性能测试...');
  const tester = new PerformanceTester();
  await tester.runAllTests();
  logger.info('性能测试完成');
}

// 如果直接运行此文件，则执行性能测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests().catch(error => {
    logger.error('性能测试执行失败:', error);
    process.exit(1);
  });
}

export {
  PerformanceTester,
  runPerformanceTests
};

export default runPerformanceTests;