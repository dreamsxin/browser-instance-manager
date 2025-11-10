require('dotenv').config();
// 使用示例
async function demoPopMinAndIncrement() {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const redisDatabase = process.env.REDIS_DATABASE || undefined;
  const RedisSortedSet = require('./redis-sorted-set'); // 根据实际路径调整
  const redisSortedSet = new RedisSortedSet({
    url: redisUrl,
    password: redisPassword,
    database: redisDatabase
  });

  try {
    await redisSortedSet.connect();
    console.log('成功连接到 Redis\n');

    const key = 'nodejs:browser:proxy_queue';

    // 从文件按行读取代理
    const fs = require('fs');
    const proxyFile = process.env.PROXY_FILE || './proxies.txt';
    const proxylist = fs.readFileSync(proxyFile, 'utf8').split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log('从文件读取的代理:', proxylist);

    // 初始化任务队列，分数代表优先级（分数越低优先级越高）
    console.log('1. 初始化任务队列:');
    // await redisSortedSet.addMultiple(key, [
    //   { score: 1, value: 'task_low_priority' },
    //   { score: 3, value: 'task_medium_priority' },
    //   { score: 5, value: 'task_high_priority' },
    //   { score: 2, value: 'task_normal_priority' },
    //   { score: 4, value: 'task_important' }
    // ]);
    for (let i = 0; i < proxylist.length; i++) {
      const proxyUrl = proxylist[i];
      await redisSortedSet.zadd(key, 0, proxyUrl);
    }

    // 显示初始状态
    console.log('初始任务队列:');
    const initialTasks = await redisSortedSet.getAllWithScores(key);
    initialTasks.forEach(task => {
      console.log(`  ${task.value}: ${task.score}`);
    });
    console.log();

    // // 2. 多次执行取出最低分并加1的操作
    // console.log('2. 执行取出最低分任务并加1的操作:');

    // for (let i = 1; i <= 3; i++) {
    //   console.log(`\n第 ${i} 次操作:`);

    //   const result = await redisSortedSet.popMinAndIncrement(key);

    //   if (result) {
    //     console.log(`  取出的任务: ${result.member}`);
    //     console.log(`  原分数: ${result.oldScore}`);
    //     console.log(`  新分数: ${result.newScore}`);
    //   } else {
    //     console.log('  没有可用的任务');
    //   }

    //   // 显示当前队列状态
    //   const currentTasks = await redisSortedSet.getAllWithScores(key);
    //   console.log('  当前队列:');
    //   currentTasks.forEach(task => {
    //     console.log(`    ${task.value}: ${task.score}`);
    //   });
    // }

    // // 3. 查看最终状态
    // console.log('\n3. 最终任务队列:');
    // const finalTasks = await redisSortedSet.getAllWithScores(key);
    // finalTasks.forEach(task => {
    //   console.log(`  ${task.value}: ${task.score}`);
    // });

  } catch (error) {
    console.error('发生错误:', error);
  } finally {
    await redisSortedSet.disconnect();
  }
}

// 运行示例
demoPopMinAndIncrement();