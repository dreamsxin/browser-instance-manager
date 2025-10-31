import BrowserManager from '../core/BrowserManager.js';
import { createLogger } from '../utils/logger.js';
import { generateId } from '../utils/helpers.js';

const logger = createLogger({ level: 'info' });

/**
 * 集群模式示例 - 模拟多任务并行处理
 */
class ClusterModeExample {
  constructor() {
    this.manager = new BrowserManager({
      maxInstances: 5,
      logLevel: 'info',
      healthCheckInterval: 20000
    });
    
    this.tasks = [];
    this.results = [];
  }

  /**
   * 创建任务
   */
  createTasks(count = 10) {
    const urls = [
      'https://httpbin.org/html',
      'https://httpbin.org/json',
      'https://httpbin.org/xml',
      'https://httpbin.org/headers',
      'https://httpbin.org/user-agent',
      'https://httpbin.org/ip',
      'https://httpbin.org/uuid',
      'https://httpbin.org/base64/hello',
      'https://httpbin.org/delay/1',
      'https://httpbin.org/bytes/1024'
    ];

    for (let i = 0; i < count; i++) {
      this.tasks.push({
        id: generateId('task'),
        url: urls[i % urls.length],
        priority: Math.random() > 0.5 ? 'high' : 'normal',
        retries: 0,
        maxRetries: 3
      });
    }

    logger.info(`创建了 ${count} 个任务`);
  }

  /**
   * 执行单个任务
   */
  async executeTask(task) {
    const instanceId = generateId('worker');
    let success = false;
    
    try {
      // 根据任务优先级选择模式
      const mode = task.priority === 'high' ? 'launch' : 'launchServer';
      
      logger.info(`执行任务 ${task.id} [${task.priority}] - ${task.url}`);
      
      await this.manager.launch(instanceId, {
        mode,
        browser: 'chromium',
        options: { headless: true }
      });

      const { page, context } = await this.manager.newPage(instanceId);
      
      // 设置超时
      const navigationPromise = page.goto(task.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Navigation timeout')), 30000)
      );

      await Promise.race([navigationPromise, timeoutPromise]);
      
      // 获取页面内容
      const content = await page.content();
      const title = await page.title();
      
      await context.close();
      await this.manager.stop(instanceId);

      this.results.push({
        taskId: task.id,
        instanceId,
        url: task.url,
        status: 'success',
        title,
        contentLength: content.length,
        timestamp: new Date()
      });

      success = true;
      logger.info(`任务 ${task.id} 完成`);

    } catch (error) {
      logger.error(`任务 ${task.id} 失败:`, error.message);
      
      this.results.push({
        taskId: task.id,
        instanceId,
        url: task.url,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      });

      // 重试逻辑
      if (task.retries < task.maxRetries) {
        task.retries++;
        logger.info(`任务 ${task.id} 准备重试 (${task.retries}/${task.maxRetries})`);
        this.tasks.push(task); // 重新加入队列
      }
    } finally {
      // 确保实例被清理
      try {
        await this.manager.stop(instanceId);
      } catch (e) {
        // 忽略清理错误
      }
    }
    
    return success;
  }

  /**
   * 执行任务队列
   */
  async executeTaskQueue(concurrency = 3) {
    logger.info(`开始执行任务队列，并发数: ${concurrency}`);
    
    const startTime = Date.now();
    let completed = 0;
    const total = this.tasks.length;

    // 创建并发工作器
    const workers = Array(concurrency).fill().map(async (_, workerId) => {
      while (this.tasks.length > 0) {
        const task = this.tasks.shift();
        if (!task) break;

        logger.debug(`工作器 ${workerId} 处理任务 ${task.id}`);
        await this.executeTask(task);
        
        completed++;
        const progress = ((completed / total) * 100).toFixed(1);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (completed / elapsed).toFixed(2);
        
        logger.info(`进度: ${progress}% (${completed}/${total}), 速率: ${rate} 任务/秒`);
      }
    });

    await Promise.all(workers);
    
    const totalTime = (Date.now() - startTime) / 1000;
    logger.info(`所有任务完成，总时间: ${totalTime.toFixed(2)}秒`);
  }

  /**
   * 显示执行结果
   */
  showResults() {
    logger.info('\n=== 任务执行结果 ===');
    
    const successCount = this.results.filter(r => r.status === 'success').length;
    const failedCount = this.results.filter(r => r.status === 'failed').length;
    
    logger.info(`成功: ${successCount}, 失败: ${failedCount}, 成功率: ${((successCount / this.results.length) * 100).toFixed(1)}%`);
    
    // 显示失败任务详情
    const failedTasks = this.results.filter(r => r.status === 'failed');
    if (failedTasks.length > 0) {
      logger.info('失败任务:');
      failedTasks.forEach(task => {
        logger.info(`  ${task.taskId}: ${task.url} - ${task.error}`);
      });
    }

    // 显示性能统计
    const managerStatus = this.manager.getStatus();
    logger.info(`管理器状态: ${managerStatus.runningInstances}/${managerStatus.totalInstances} 实例运行中`);
    
    // 显示健康状态
    const healthReport = this.manager.healthMonitor.getHealthReport();
    logger.info(`健康状态: ${healthReport.overallHealth}`);
  }

  /**
   * 运行集群示例
   */
  async run() {
    try {
      // 创建任务
      this.createTasks(15);
      
      // 执行任务队列
      await this.executeTaskQueue(3);
      
      // 显示结果
      this.showResults();
      
    } catch (error) {
      logger.error('集群模式示例执行失败:', error);
    } finally {
      await this.manager.shutdown();
    }
  }
}

/**
 * 负载均衡示例
 */
class LoadBalancingExample {
  constructor() {
    this.manager = new BrowserManager({
      maxInstances: 4,
      logLevel: 'info'
    });
    
    this.instances = [];
    this.nextInstanceIndex = 0;
  }

  /**
   * 初始化负载均衡器
   */
  async initialize() {
    // 创建多个浏览器实例
    const instanceCount = 3;
    
    for (let i = 0; i < instanceCount; i++) {
      const instanceId = `lb-instance-${i}`;
      
      await this.manager.launch(instanceId, {
        mode: 'launchServer',
        browser: 'chromium',
        options: { headless: true }
      });
      
      this.instances.push(instanceId);
    }
    
    logger.info(`负载均衡器初始化完成，共有 ${this.instances.length} 个实例`);
  }

  /**
   * 轮询选择实例
   */
  getNextInstance() {
    const instanceId = this.instances[this.nextInstanceIndex];
    this.nextInstanceIndex = (this.nextInstanceIndex + 1) % this.instances.length;
    return instanceId;
  }

  /**
   * 执行负载均衡任务
   */
  async executeLoadBalancedTask(url) {
    const instanceId = this.getNextInstance();
    const taskId = generateId('lb-task');
    
    logger.debug(`任务 ${taskId} 分配给实例 ${instanceId}`);
    
    try {
      const { page, context } = await this.manager.newPage(instanceId);
      
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const title = await page.title();
      
      await context.close();
      
      logger.info(`任务 ${taskId} 完成 - ${title}`);
      
      return { success: true, title, instanceId };
      
    } catch (error) {
      logger.error(`任务 ${taskId} 失败:`, error.message);
      return { success: false, error: error.message, instanceId };
    }
  }

  /**
   * 运行负载均衡示例
   */
  async run() {
    try {
      await this.initialize();
      
      const urls = [
        'https://httpbin.org/html',
        'https://httpbin.org/json',
        'https://httpbin.org/xml',
        'https://httpbin.org/headers',
        'https://httpbin.org/user-agent',
        'https://httpbin.org/ip'
      ];
      
      // 并行执行多个任务
      const tasks = urls.map(url => this.executeLoadBalancedTask(url));
      const results = await Promise.allSettled(tasks);
      
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      logger.info(`负载均衡任务完成: ${successCount}/${urls.length} 成功`);
      
      // 显示实例使用情况
      const instances = this.manager.getAllInstances();
      instances.forEach(instance => {
        logger.info(`实例 ${instance.id}: ${instance.status}, 最后活动: ${instance.lastActivity.toISOString()}`);
      });
      
    } catch (error) {
      logger.error('负载均衡示例执行失败:', error);
    } finally {
      await this.manager.shutdown();
    }
  }
}

// 运行所有集群模式示例
async function runClusterExamples() {
  logger.info('=== 集群模式示例 ===');
  
  // 运行任务队列示例
  const clusterExample = new ClusterModeExample();
  await clusterExample.run();
  
  logger.info('\n=== 负载均衡示例 ===');
  
  // 运行负载均衡示例
  const lbExample = new LoadBalancingExample();
  await lbExample.run();
  
  logger.info('所有集群模式示例完成');
}

// 如果直接运行此文件，则执行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runClusterExamples().catch(error => {
    logger.error('集群模式示例执行失败:', error);
    process.exit(1);
  });
}

export {
  ClusterModeExample,
  LoadBalancingExample,
  runClusterExamples
};

export default runClusterExamples;