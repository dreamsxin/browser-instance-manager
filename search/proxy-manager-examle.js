const ProxyIPManager = require('./proxy-manager');
const ProxyScheduler = require('./proxy-scheduler');

// 使用示例
async function example() {
  const proxyManager = new ProxyIPManager({
    host: '127.0.0.1',
    port: 6379
    // password: 'your_password' // 如果有密码
  });

  try {
    // 启动时恢复所有过期代理
    await proxyManager.recoverAllExpiredProxies();
    
    // 启动自动恢复任务
    const stopRecovery = proxyManager.startAutoRecovery(30000);

    // 从文件导入代理
    console.log('=== 导入代理示例 ===');
    await proxyManager.importFromFile('proxies.txt', {
      queue: 'checking',
      format: 'plain',
      defaultMetadata: {
        source: 'file_import',
        protocol: 'http'
      }
    });

    // 启动代理检查调度器
    const scheduler = new ProxyScheduler(proxyManager, 30000);
    scheduler.start();

    // 安全获取代理使用示例
    console.log('\n=== 安全获取代理示例 ===');
    
    const proxy = await proxyManager.safeGetProxy(300, {
      maxRetries: 3,
      autoRenew: true
    });
    
    if (proxy) {
      try {
        console.log(`成功获取代理: ${proxy.ip}`);
        
        // 模拟使用代理进行网络请求
        console.log('使用代理进行网络请求...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 随机决定成功或失败
        const success = Math.random() > 0.3;
        
        if (success) {
          // 使用成功，释放代理回可用队列
          await proxy._release();
          console.log('代理使用成功，已释放');
        } else {
          // 使用失败，标记代理为失败
          await proxy._markFailed();
          console.log('代理使用失败，已标记待检查');
        }
        
      } catch (error) {
        console.error('使用代理时发生错误:', error);
        // 发生异常时确保释放代理
        await proxy._markFailed();
      }
    }

    // 查看统计信息
    const stats = await proxyManager.getQueueStats();
    console.log('\n=== 队列统计 ===');
    console.log('可用代理:', stats.availableCount);
    console.log('待检查代理:', stats.checkingCount);
    console.log('使用中代理:', stats.usingCount);
    console.log('已过期代理:', stats.expiredCount);
    console.log('总计:', stats.totalCount);

    // 导出代理到文件
    console.log('\n=== 导出代理 ===');
    await proxyManager.exportToFile('exported_proxies.txt', {
      queue: 'available',
      format: 'plain'
    });

    // 停止调度器和恢复任务
    scheduler.stop();
    stopRecovery();

  } catch (error) {
    console.error('示例运行失败:', error);
  } finally {
    await proxyManager.disconnect();
  }
}

// 多工作线程示例
async function multiWorkerExample() {
  const proxyManager = new ProxyIPManager();
  
  try {
    await proxyManager.recoverAllExpiredProxies();
    const stopRecovery = proxyManager.startAutoRecovery();
    
    // 工作函数
    async function worker(workerId) {
      let taskCount = 0;
      
      while (taskCount < 5) { // 每个worker执行5个任务
        const proxy = await proxyManager.safeGetProxy(120, {
          maxRetries: 2,
          autoRenew: true
        });
        
        if (!proxy) {
          console.log(`Worker ${workerId}: 无可用代理，等待中...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        try {
          console.log(`Worker ${workerId}: 使用代理 ${proxy.ip}`);
          
          // 模拟工作
          const workTime = Math.random() * 8000 + 2000;
          await new Promise(resolve => setTimeout(resolve, workTime));
          
          // 80% 成功率
          if (Math.random() > 0.2) {
            // 根据响应时间调整分数
            const newScore = workTime < 5000 ? (proxy.score || 100) + 20 : (proxy.score || 100) + 5;
            await proxy._release(newScore);
            console.log(`Worker ${workerId}: 任务完成，代理已释放`);
          } else {
            await proxy._markFailed();
            console.log(`Worker ${workerId}: 任务失败，代理待检查`);
          }
          
        } catch (error) {
          console.error(`Worker ${workerId}: 发生错误`, error);
          await proxy._markFailed();
        }
        
        taskCount++;
        
        // 随机间隔
        await new Promise(resolve => 
          setTimeout(resolve, Math.random() * 3000 + 1000)
        );
      }
      
      console.log(`Worker ${workerId}: 完成任务`);
    }
    
    // 启动多个工作线程
    const workers = [];
    for (let i = 0; i < 3; i++) {
      workers.push(worker(i + 1));
    }
    
    // 等待所有工作线程完成
    await Promise.all(workers);
    
    // 最终统计
    const finalStats = await proxyManager.getQueueStats();
    console.log('\n=== 最终统计 ===');
    console.log('可用代理:', finalStats.availableCount);
    console.log('待检查代理:', finalStats.checkingCount);
    console.log('使用中代理:', finalStats.usingCount);
    
    stopRecovery();
    
  } catch (error) {
    console.error('多工作线程示例失败:', error);
  } finally {
    await proxyManager.disconnect();
  }
}

// 运行示例
if (require.main === module) {
  example()
    .then(() => console.log('示例运行完成'))
    .catch(console.error);
    
  // 也可以运行多工作线程示例
  // multiWorkerExample().catch(console.error);
}

module.exports = { example, multiWorkerExample };