#!/usr/bin/env node

import { performance } from 'perf_hooks';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import BrowserManager from '../src/core/BrowserManager.js';
import { getPreset } from '../config/presets.js';
import { createLogger, getMetricsCollector } from '../utils/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json')));

const logger = createLogger({ level: 'info' });
const metrics = getMetricsCollector();

class BenchmarkRunner {
  constructor() {
    this.manager = new BrowserManager({
      maxInstances: 10,
      logLevel: 'warn',
      healthCheckInterval: 30000
    });
    
    this.results = {
      version: pkg.version,
      timestamp: new Date().toISOString(),
      tests: {}
    };
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
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  }

  /**
   * 记录内存使用情况
   */
  recordMemoryUsage(stage) {
    if (process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        stage,
        rss: this.formatBytes(usage.rss),
        heapTotal: this.formatBytes(usage.heapTotal),
        heapUsed: this.formatBytes(usage.heapUsed),
        external: this.formatBytes(usage.external)
      };
    }
    return { stage, rss: 'N/A' };
  }

  /**
   * 测试1: 实例启动性能
   */
  async testInstanceLaunch() {
    logger.info('🏁 测试实例启动性能...');
    
    const testResults = [];
    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      await this.manager.launch(`launch-test-${i}`, {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      const launchTime = performance.now() - startTime;
      testResults.push(launchTime);
      
      await this.manager.stop(`launch-test-${i}`);
    }

    const avgTime = testResults.reduce((a, b) => a + b) / testResults.length;
    
    this.results.tests.instanceLaunch = {
      iterations,
      results: testResults,
      average: avgTime,
      min: Math.min(...testResults),
      max: Math.max(...testResults),
      memory: this.recordMemoryUsage('instanceLaunch')
    };

    logger.info(`✅ 实例启动测试完成 - 平均: ${this.formatDuration(avgTime)}`);
    return testResults;
  }

  /**
   * 测试2: 页面创建性能
   */
  async testPageCreation() {
    logger.info('📄 测试页面创建性能...');
    
    await this.manager.launch('page-creation-test', {
      mode: 'launchServer',
      browser: 'chromium',
      options: { headless: true }
    });

    const testResults = [];
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      const { page, context } = await this.manager.newPage('page-creation-test');
      await page.goto('about:blank');
      await page.waitForTimeout(10);
      
      const creationTime = performance.now() - startTime;
      testResults.push(creationTime);
      
      await context.close();
    }

    await this.manager.stop('page-creation-test');

    const avgTime = testResults.reduce((a, b) => a + b) / testResults.length;
    
    this.results.tests.pageCreation = {
      iterations,
      results: testResults,
      average: avgTime,
      min: Math.min(...testResults),
      max: Math.max(...testResults),
      memory: this.recordMemoryUsage('pageCreation')
    };

    logger.info(`✅ 页面创建测试完成 - 平均: ${this.formatDuration(avgTime)}`);
    return testResults;
  }

  /**
   * 测试3: 并发性能
   */
  async testConcurrency() {
    logger.info('⚡ 测试并发性能...');
    
    const concurrencyLevels = [1, 3, 5];
    const testResults = [];

    for (const level of concurrencyLevels) {
      const startTime = performance.now();
      const promises = [];

      for (let i = 0; i < level; i++) {
        const promise = this.manager.launch(`concurrent-${level}-${i}`, {
          mode: 'launch',
          browser: 'chromium',
          options: { headless: true }
        }).then(async (instance) => {
          const { page, context } = await this.manager.newPage(`concurrent-${level}-${i}`);
          await page.goto('about:blank');
          await context.close();
          return instance;
        });
        
        promises.push(promise);
      }

      await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      // 清理实例
      for (let i = 0; i < level; i++) {
        await this.manager.stop(`concurrent-${level}-${i}`);
      }

      testResults.push({
        concurrency: level,
        totalTime,
        averageTime: totalTime / level
      });

      logger.info(`  并发 ${level}: 总时间 ${this.formatDuration(totalTime)}, 平均 ${this.formatDuration(totalTime / level)}/实例`);
    }

    this.results.tests.concurrency = {
      levels: concurrencyLevels,
      results: testResults,
      memory: this.recordMemoryUsage('concurrency')
    };

    logger.info('✅ 并发测试完成');
    return testResults;
  }

  /**
   * 测试4: 内存使用
   */
  async testMemoryUsage() {
    logger.info('💾 测试内存使用...');
    
    const memoryReadings = [];
    const instanceCount = 5;

    // 初始内存
    memoryReadings.push(this.recordMemoryUsage('初始'));

    // 逐步创建实例
    for (let i = 0; i < instanceCount; i++) {
      await this.manager.launch(`memory-test-${i}`, {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      memoryReadings.push(this.recordMemoryUsage(`实例 ${i + 1}`));
    }

    // 清理所有实例
    await this.manager.stopAll();
    memoryReadings.push(this.recordMemoryUsage('清理后'));

    this.results.tests.memoryUsage = {
      readings: memoryReadings,
      instanceCount
    };

    logger.info('✅ 内存使用测试完成');
    return memoryReadings;
  }

  /**
   * 测试5: 预设配置性能
   */
  async testPresetsPerformance() {
    logger.info('🎯 测试预设配置性能...');
    
    const presets = ['scraping', 'testing', 'headless_minimal'];
    const testResults = [];

    for (const presetName of presets) {
      const preset = getPreset(presetName);
      const startTime = performance.now();
      
      await this.manager.launch(`preset-${presetName}`, preset);
      
      const launchTime = performance.now() - startTime;
      
      // 测试页面加载
      const pageStartTime = performance.now();
      const { page, context } = await this.manager.newPage(`preset-${presetName}`);
      await page.goto('https://httpbin.org/html');
      const pageLoadTime = performance.now() - pageStartTime;
      
      await context.close();
      await this.manager.stop(`preset-${presetName}`);

      testResults.push({
        preset: presetName,
        launchTime,
        pageLoadTime,
        mode: preset.mode,
        browser: preset.browser
      });

      logger.info(`  ${presetName}: 启动 ${this.formatDuration(launchTime)}, 页面加载 ${this.formatDuration(pageLoadTime)}`);
    }

    this.results.tests.presets = {
      results: testResults,
      memory: this.recordMemoryUsage('presets')
    };

    logger.info('✅ 预设配置测试完成');
    return testResults;
  }

  /**
   * 生成基准测试报告
   */
  generateReport() {
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 浏览器实例管理器 - 基准测试报告');
    logger.info('='.repeat(60));
    
    logger.info(`版本: ${this.results.version}`);
    logger.info(`时间: ${this.results.timestamp}`);
    logger.info(`Node.js: ${process.version}`);
    logger.info(`平台: ${process.platform}/${process.arch}`);

    // 实例启动性能
    if (this.results.tests.instanceLaunch) {
      const test = this.results.tests.instanceLaunch;
      logger.info('\n🏁 实例启动性能:');
      logger.info(`  迭代次数: ${test.iterations}`);
      logger.info(`  平均时间: ${this.formatDuration(test.average)}`);
      logger.info(`  最快: ${this.formatDuration(test.min)}`);
      logger.info(`  最慢: ${this.formatDuration(test.max)}`);
    }

    // 页面创建性能
    if (this.results.tests.pageCreation) {
      const test = this.results.tests.pageCreation;
      logger.info('\n📄 页面创建性能:');
      logger.info(`  迭代次数: ${test.iterations}`);
      logger.info(`  平均时间: ${this.formatDuration(test.average)}`);
      logger.info(`  最快: ${this.formatDuration(test.min)}`);
      logger.info(`  最慢: ${this.formatDuration(test.max)}`);
    }

    // 并发性能
    if (this.results.tests.concurrency) {
      logger.info('\n⚡ 并发性能:');
      this.results.tests.concurrency.results.forEach(result => {
        logger.info(`  并发 ${result.concurrency}: 总时间 ${this.formatDuration(result.totalTime)}, 平均 ${this.formatDuration(result.averageTime)}/实例`);
      });
    }

    // 内存使用
    if (this.results.tests.memoryUsage) {
      logger.info('\n💾 内存使用变化:');
      this.results.tests.memoryUsage.readings.forEach(reading => {
        logger.info(`  ${reading.stage}: RSS=${reading.rss}, 堆=${reading.heapUsed}`);
      });
    }

    // 预设配置
    if (this.results.tests.presets) {
      logger.info('\n🎯 预设配置性能:');
      this.results.tests.presets.results.forEach(result => {
        logger.info(`  ${result.preset}: 启动 ${this.formatDuration(result.launchTime)}, 页面加载 ${this.formatDuration(result.pageLoadTime)}`);
      });
    }

    // 全局指标
    const metricsSummary = metrics.getSummary();
    logger.info('\n📈 全局指标:');
    logger.info(`  总实例数: ${metricsSummary.totalInstances}`);
    logger.info(`  总页面创建: ${metricsSummary.totalPagesCreated}`);
    logger.info(`  总请求数: ${metricsSummary.totalRequestsMade}`);
    logger.info(`  错误率: ${metricsSummary.errorRate.toFixed(2)}%`);
    logger.info(`  运行时间: ${this.formatDuration(metricsSummary.uptime)}`);

    logger.info('\n' + '='.repeat(60));
    logger.info('✅ 基准测试完成');
    logger.info('='.repeat(60));
  }

  /**
   * 运行所有基准测试
   */
  async runAllTests() {
    try {
      logger.info('🚀 开始浏览器实例管理器基准测试...');
      
      await this.testInstanceLaunch();
      await this.testPageCreation();
      await this.testConcurrency();
      await this.testMemoryUsage();
      await this.testPresetsPerformance();
      
      this.generateReport();
      
    } catch (error) {
      logger.error('基准测试失败:', error);
      process.exit(1);
    } finally {
      await this.manager.shutdown();
    }
  }
}

// 运行基准测试
async function main() {
  const runner = new BenchmarkRunner();
  await runner.runAllTests();
}

// 命令行接口
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('基准测试执行失败:', error);
    process.exit(1);
  });
}

export {
  BenchmarkRunner
};

export default BenchmarkRunner;