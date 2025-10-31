import BrowserManager from '../core/BrowserManager.js';
import { getPreset } from '../config/presets.js';
import { createLogger, getMetricsCollector } from '../utils/index.js';

const logger = createLogger({ level: 'info' });
const metrics = getMetricsCollector();

/**
 * 最佳实践示例
 */
class BestPracticesExample {
  constructor() {
    this.manager = null;
  }

  /**
   * 实践1: 正确的资源管理
   */
  async practiceResourceManagement() {
    logger.info('=== 实践1: 正确的资源管理 ===');
    
    this.manager = new BrowserManager({
      maxInstances: 3,
      logLevel: 'info'
    });

    // 错误的做法: 不清理资源
    const badPractice = async () => {
      const instance = await this.manager.launch('bad-practice', {
        mode: 'launch',
        browser: 'chromium'
      });

      // 创建页面但不关闭
      const { page } = await this.manager.newPage('bad-practice');
      await page.goto('https://httpbin.org/html');
      
      // 忘记关闭页面和实例
      // 这会导致内存泄漏!
    };

    // 正确的做法: 总是清理资源
    const goodPractice = async () => {
      try {
        const instance = await this.manager.launch('good-practice', {
          mode: 'launch',
          browser: 'chromium'
        });

        const { page, context } = await this.manager.newPage('good-practice');
        
        try {
          await page.goto('https://httpbin.org/html');
          const title = await page.title();
          logger.info(`页面标题: ${title}`);
        } finally {
          // 总是关闭上下文
          await context.close();
        }

      } finally {
        // 总是停止实例
        await this.manager.stop('good-practice');
      }
    };

    try {
      await badPractice();
      logger.warn('错误做法执行完成 (注意: 资源未清理!)');
      
      // 强制清理
      await this.manager.stop('bad-practice').catch(() => {});
      
      await goodPractice();
      logger.info('正确做法执行完成 (资源已正确清理)');
      
    } catch (error) {
      logger.error('资源管理实践失败:', error);
    }
  }

  /**
   * 实践2: 错误处理和重试
   */
  async practiceErrorHandling() {
    logger.info('\n=== 实践2: 错误处理和重试 ===');
    
    this.manager = new BrowserManager({
      maxInstances: 2,
      logLevel: 'info'
    });

    // 简单的重试机制
    const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
      let lastError;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error;
          logger.warn(`尝试 ${attempt} 失败: ${error.message}`);
          
          if (attempt < maxRetries) {
            logger.info(`等待 ${delay}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // 指数退避
          }
        }
      }
      
      throw lastError;
    };

    try {
      await this.manager.launch('error-handling', {
        mode: 'launch',
        browser: 'chromium'
      });

      const { page, context } = await this.manager.newPage('error-handling');
      
      // 使用重试机制处理不稳定的操作
      await retryOperation(async () => {
        await page.goto('https://httpbin.org/status/500', { 
          timeout: 10000,
          waitUntil: 'domcontentloaded'
        });
      }, 2, 1000);
      
      await context.close();
      await this.manager.stop('error-handling');
      
      logger.info('错误处理实践完成');
      
    } catch (error) {
      logger.error('所有重试尝试都失败了:', error.message);
    }
  }

  /**
   * 实践3: 性能优化
   */
  async practicePerformanceOptimization() {
    logger.info('\n=== 实践3: 性能优化 ===');
    
    this.manager = new BrowserManager({
      maxInstances: 4,
      logLevel: 'info'
    });

    // 使用合适的启动模式
    const testLaunchMode = async () => {
      const startTime = Date.now();
      
      await this.manager.launch('launch-mode', {
        mode: 'launch',
        browser: 'chromium'
      });

      const { page, context } = await this.manager.newPage('launch-mode');
      await page.goto('https://httpbin.org/html');
      await context.close();
      await this.manager.stop('launch-mode');
      
      return Date.now() - startTime;
    };

    const testLaunchServerMode = async () => {
      const startTime = Date.now();
      
      await this.manager.launch('server-mode', {
        mode: 'launchServer',
        browser: 'chromium'
      });

      // 多次使用同一个实例
      for (let i = 0; i < 3; i++) {
        const { page, context } = await this.manager.newPage('server-mode');
        await page.goto('https://httpbin.org/html');
        await context.close();
      }
      
      await this.manager.stop('server-mode');
      
      return Date.now() - startTime;
    };

    try {
      const launchTime = await testLaunchMode();
      const serverTime = await testLaunchServerMode();
      
      logger.info(`Launch 模式时间: ${launchTime}ms`);
      logger.info(`LaunchServer 模式时间: ${serverTime}ms`);
      logger.info(`推荐: ${launchTime < serverTime ? '单个任务使用 Launch 模式' : '多个任务使用 LaunchServer 模式'}`);
      
    } catch (error) {
      logger.error('性能优化实践失败:', error);
    }
  }

  /**
   * 实践4: 配置优化
   */
  async practiceConfigurationOptimization() {
    logger.info('\n=== 实践4: 配置优化 ===');
    
    // 不同场景的配置优化
    const scenarios = {
      scraping: getPreset('scraping'),
      testing: getPreset('testing'),
      production: getPreset('production')
    };

    for (const [scenario, config] of Object.entries(scenarios)) {
      logger.info(`\n场景: ${scenario}`);
      logger.info(`  模式: ${config.mode}`);
      logger.info(`  浏览器: ${config.browser}`);
      logger.info(`  无头模式: ${config.options.headless}`);
      logger.info(`  参数数量: ${config.options.args?.length || 0}`);
    }

    // 自定义优化配置
    const optimizedConfig = {
      mode: 'launchServer',
      browser: 'chromium',
      options: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--aggressive-cache-discard',
          '--max_old_space_size=4096'
        ],
        viewport: { width: 1920, height: 1080 }
      }
    };

    logger.info('\n自定义优化配置:');
    logger.info('  适合: 高性能网页抓取');
    logger.info('  特性: 内存优化、性能优化、稳定性增强');
  }

  /**
   * 实践5: 监控和指标
   */
  async practiceMonitoring() {
    logger.info('\n=== 实践5: 监控和指标 ===');
    
    this.manager = new BrowserManager({
      maxInstances: 2,
      logLevel: 'info'
    });

    // 设置指标收集
    metrics.on('metricsUpdated', (instanceId, metric, value) => {
      logger.debug(`指标更新: ${instanceId} - ${metric} = ${value}`);
    });

    try {
      await this.manager.launch('monitoring-1', { mode: 'launch' });
      await this.manager.launch('monitoring-2', { mode: 'launch' });

      // 执行一些操作来生成指标
      for (let i = 0; i < 3; i++) {
        const { page, context } = await this.manager.newPage('monitoring-1');
        await page.goto('https://httpbin.org/html');
        await context.close();
      }

      // 获取并显示指标
      const summary = metrics.getSummary();
      const performance = metrics.getPerformanceReport();
      
      logger.info('监控指标:');
      logger.info(`  总实例: ${summary.totalInstances}`);
      logger.info(`  总页面: ${summary.totalPagesCreated}`);
      logger.info(`  平均启动时间: ${performance.launch.average.toFixed(2)}ms`);
      logger.info(`  平均页面创建时间: ${performance.pageCreation.average.toFixed(2)}ms`);
      
      // 显示可读的报告
      logger.info('\n详细报告:');
      logger.info(metrics.generateReadableReport());
      
    } finally {
      await this.manager.stopAll();
    }
  }

  /**
   * 实践6: 安全实践
   */
  async practiceSecurity() {
    logger.info('\n=== 实践6: 安全实践 ===');
    
    this.manager = new BrowserManager({
      maxInstances: 2,
      logLevel: 'info'
    });

    // 安全配置示例
    const securityConfig = {
      mode: 'launch',
      browser: 'chromium',
      options: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-background-timer-throttling'
        ]
      },
      contextOptions: {
        ignoreHTTPSErrors: false, // 不忽略HTTPS错误
        javaScriptEnabled: true,
        blockImages: false
      }
    };

    try {
      await this.manager.launch('secure-instance', securityConfig);
      
      const { page, context } = await this.manager.newPage('secure-instance');
      
      // 设置额外的安全头
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      await page.goto('https://httpbin.org/headers');
      const content = await page.content();
      
      logger.info('安全实践完成');
      logger.info('安全特性:');
      logger.info('  - 沙盒模式');
      logger.info('  - 禁用危险特性');
      logger.info('  - 严格的HTTPS检查');
      logger.info('  - 自定义用户代理');
      
      await context.close();
      await this.manager.stop('secure-instance');
      
    } catch (error) {
      logger.error('安全实践失败:', error);
    }
  }

  /**
   * 运行所有最佳实践
   */
  async runAllPractices() {
    try {
      await this.practiceResourceManagement();
      await this.practiceErrorHandling();
      await this.practicePerformanceOptimization();
      await this.practiceConfigurationOptimization();
      await this.practiceMonitoring();
      await this.practiceSecurity();
      
      logger.info('\n=== 所有最佳实践完成 ===');
      
    } catch (error) {
      logger.error('最佳实践执行失败:', error);
    } finally {
      if (this.manager) {
        await this.manager.shutdown();
      }
    }
  }
}

// 运行最佳实践示例
async function runBestPractices() {
  logger.info('开始最佳实践示例...');
  const example = new BestPracticesExample();
  await example.runAllPractices();
  logger.info('最佳实践示例完成');
}

// 如果直接运行此文件，则执行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runBestPractices().catch(error => {
    logger.error('最佳实践示例执行失败:', error);
    process.exit(1);
  });
}

export {
  BestPracticesExample,
  runBestPractices
};

export default runBestPractices;