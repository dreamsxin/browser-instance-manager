// 使用示例
async function demoPopMinAndIncrement() {
  const RedisSortedSet = require('./redis-sorted-set'); // 根据实际路径调整
  const redisSortedSet = new RedisSortedSet({
    url: 'redis://192.168.0.80:6379',
    password: "123456",
    database: "11"
  });

  try {
    await redisSortedSet.connect();
    console.log('成功连接到 Redis\n');

    const key = 'nodejs:browser:proxy_queue';

    const proxylist = [
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.182:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.103.182:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.163:5206",
        "http://mSV6YJemvL:jqPxPczwth@45.10.210.104:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.98.166:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.167:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.183:5206",
        "http://mSV6YJemvL:jqPxPczwth@45.9.110.208:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.190:5206",
        "http://mSV6YJemvL:jqPxPczwth@45.142.76.235:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.104.173:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.98.163:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.101.165:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.166:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.97.167:5206",
        "http://tVr7SpSb6L:7Ghj4j9an6@38.207.99.172:5206",

        'http://wj034oOoBN:PjmashCzy1@154.196.159.70:5206',
        'http://wnaK05Fn8a:YQAaCaMINP@154.196.156.144:5206',
        'http://6EgeWDUCJY:zKqC5q81Pb@154.196.128.67:5206',
        'http://Mmmdkiob7W:N3AbwaGiqi@154.196.152.123:5206',
        'http://1VGEhzGEmd:TvtEABk6UK@154.196.158.237:5206',
        'http://4m080Sefbh:kVLgTjfakC@154.196.154.50:5206',
        'http://0n0NjOp6Fl:31HoNDPGnA@154.196.157.228:5206',
        'http://wj034oOoBN:PjmashCzy1@154.196.159.254:5206',
        'http://0n0NjOp6Fl:31HoNDPGnA@154.196.157.61:5206',
        'http://4m080Sefbh:kVLgTjfakC@154.196.154.124:5206',
        'http://1VGEhzGEmd:TvtEABk6UK@154.196.158.93:5206',
        'http://Mmmdkiob7W:N3AbwaGiqi@154.196.152.30:5206'
      ];
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

    // 2. 多次执行取出最低分并加1的操作
    console.log('2. 执行取出最低分任务并加1的操作:');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n第 ${i} 次操作:`);
      
      const result = await redisSortedSet.popMinAndIncrement(key);
      
      if (result) {
        console.log(`  取出的任务: ${result.member}`);
        console.log(`  原分数: ${result.oldScore}`);
        console.log(`  新分数: ${result.newScore}`);
      } else {
        console.log('  没有可用的任务');
      }

      // 显示当前队列状态
      const currentTasks = await redisSortedSet.getAllWithScores(key);
      console.log('  当前队列:');
      currentTasks.forEach(task => {
        console.log(`    ${task.value}: ${task.score}`);
      });
    }

    // 3. 查看最终状态
    console.log('\n3. 最终任务队列:');
    const finalTasks = await redisSortedSet.getAllWithScores(key);
    finalTasks.forEach(task => {
      console.log(`  ${task.value}: ${task.score}`);
    });

  } catch (error) {
    console.error('发生错误:', error);
  } finally {
    await redisSortedSet.disconnect();
  }
}

// 运行示例
demoPopMinAndIncrement();