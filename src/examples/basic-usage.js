import BrowserManager from '../core/BrowserManager.js';
import { getPreset } from '../config/presets.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ level: 'info' });

/**
 * 基础用法示例
 */
async function basicUsage() {
  logger.info('=== 浏览器实例管理器基础用法示例 ===');

  const manager = new BrowserManager({
    maxInstances: 3,
    logLevel: 'info'
  });

  try {
    // 示例 1: 使用 Launch 模式（适合短期任务）
    logger.info('\n1. Launch 模式示例');
    const launchInstance = await manager.launch('quick-task', {
      mode: 'launch',
      browser: 'chromium',
      options: {
        headless: true,
        viewport: { width: 1280, height: 720 }
      }
    });

    const { page: page1, context: context1 } = await manager.newPage('quick-task');
    await page1.goto('https://httpbin.org/user-agent');
    const userAgent = await page1.evaluate(() => document.body.textContent);
    logger.info(`页面内容: ${userAgent.substring(0, 100)}...`);
    await context1.close();

    // 示例 2: 使用 LaunchServer 模式（适合长期任务）
    logger.info('\n2. LaunchServer 模式示例');
    const serverInstance = await manager.launch('long-running', {
      mode: 'launchServer',
      browser: 'chromium',
      options: {
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      }
    });

    // 在同一个浏览器实例中创建多个页面
    const { page: page2 } = await manager.newPage('long-running');
    await page2.goto('https://httpbin.org/html');
    const title2 = await page2.title();
    logger.info(`页面标题: ${title2}`);

    const { page: page3 } = await manager.newPage('long-running');
    await page3.goto('https://httpbin.org/json');
    const title3 = await page3.title();
    logger.info(`页面标题: ${title3}`);

    // 示例 3: 使用预设配置
    logger.info('\n3. 预设配置示例');
    const scrapingConfig = getPreset('scraping');
    const scrapingInstance = await manager.launch('scraper', scrapingConfig);

    const { page: page4 } = await manager.newPage('scraper');
    await page4.goto('https://httpbin.org/headers');
    const headers = await page4.evaluate(() => document.body.textContent);
    logger.info(`请求头信息: ${headers.substring(0, 150)}...`);

    // 显示所有实例状态
    logger.info('\n4. 实例状态');
    const instances = manager.getAllInstances();
    instances.forEach(instance => {
      logger.info(`实例 ${instance.id}: ${instance.status}, 浏览器: ${instance.browserType}, 模式: ${instance.mode}`);
    });

    // 显示管理器状态
    const status = manager.getStatus();
    logger.info('\n5. 管理器状态');
    logger.info(`总实例数: ${status.totalInstances}, 运行中: ${status.runningInstances}, 最大限制: ${status.maxInstances}`);

    // 等待一段时间展示长期运行能力
    logger.info('\n6. 等待 5 秒展示长期运行...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    logger.error('示例执行出错:', error);
  } finally {
    // 清理资源
    logger.info('\n7. 清理资源...');
    await manager.stopAll();
    logger.info('所有浏览器实例已停止');
  }
}

/**
 * 错误处理示例
 */
async function errorHandlingExample() {
  logger.info('\n=== 错误处理示例 ===');

  const manager = new BrowserManager({
    maxInstances: 2,
    logLevel: 'info'
  });

  try {
    // 示例 1: 重复实例 ID
    try {
      await manager.launch('test-instance', { mode: 'launch' });
      await manager.launch('test-instance', { mode: 'launch' }); // 应该失败
    } catch (error) {
      logger.info(`预期错误: ${error.message}`);
    }

    // 示例 2: 超过实例限制
    try {
      await manager.launch('instance-1', { mode: 'launch' });
      await manager.launch('instance-2', { mode: 'launch' });
      await manager.launch('instance-3', { mode: 'launch' }); // 应该失败
    } catch (error) {
      logger.info(`预期错误: ${error.message}`);
    }

    // 示例 3: 不存在的实例操作
    try {
      await manager.newPage('non-existent-instance');
    } catch (error) {
      logger.info(`预期错误: ${error.message}`);
    }

  } finally {
    await manager.stopAll();
  }
}

/**
 * 性能对比示例
 */
async function performanceComparison() {
  logger.info('\n=== 性能对比示例 ===');

  const manager = new BrowserManager({
    maxInstances: 5,
    logLevel: 'warn' // 减少日志输出
  });

  const results = {
    launch: [],
    launchServer: []
  };

  try {
    // 测试 Launch 模式
    logger.info('测试 Launch 模式...');
    for (let i = 0; i < 3; i++) {
      const startTime = Date.now();
      
      const instance = await manager.launch(`perf-launch-${i}`, {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      const { page, context } = await manager.newPage(`perf-launch-${i}`);
      await page.goto('https://httpbin.org/get');
      await page.waitForTimeout(100);
      
      await context.close();
      await manager.stop(`perf-launch-${i}`);
      
      const endTime = Date.now();
      results.launch.push(endTime - startTime);
    }

    // 测试 LaunchServer 模式
    logger.info('测试 LaunchServer 模式...');
    await manager.launch('perf-server', {
      mode: 'launchServer',
      browser: 'chromium',
      options: { headless: true }
    });

    for (let i = 0; i < 3; i++) {
      const startTime = Date.now();
      
      const { page, context } = await manager.newPage('perf-server');
      await page.goto('https://httpbin.org/get');
      await page.waitForTimeout(100);
      
      await context.close();
      
      const endTime = Date.now();
      results.launchServer.push(endTime - startTime);
    }

    await manager.stop('perf-server');

    // 输出结果
    logger.info('\n性能测试结果:');
    const launchAvg = results.launch.reduce((a, b) => a + b) / results.launch.length;
    const serverAvg = results.launchServer.reduce((a, b) => a + b) / results.launchServer.length;
    
    logger.info(`Launch 模式平均时间: ${launchAvg.toFixed(2)}ms`);
    logger.info(`LaunchServer 模式平均时间: ${serverAvg.toFixed(2)}ms`);
    logger.info(`性能提升: ${((launchAvg - serverAvg) / launchAvg * 100).toFixed(2)}%`);

  } finally {
    await manager.stopAll();
  }
}

// 运行所有示例
async function runAllExamples() {
  await basicUsage();
  await errorHandlingExample();
  await performanceComparison();
  logger.info('\n=== 所有示例执行完成 ===');
}

// 如果直接运行此文件，则执行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(error => {
    logger.error('示例执行失败:', error);
    process.exit(1);
  });
}

export {
  basicUsage,
  errorHandlingExample,
  performanceComparison,
  runAllExamples
};

export default runAllExamples;