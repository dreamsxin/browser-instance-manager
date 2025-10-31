export { default as basicUsage } from './basic-usage.js';
export { default as performanceTest } from './performance-test.js';
export { default as clusterMode } from './cluster-mode.js';
export { default as bestPractices } from './best-practices.js';

// 导出所有示例的运行函数
export { runAllExamples } from './basic-usage.js';
export { runPerformanceTests } from './performance-test.js';
export { runClusterExamples } from './cluster-mode.js';
export { runBestPractices } from './best-practices.js';

/**
 * 运行所有示例
 */
async function runAllExamples() {
  const examples = [
    { name: '基础用法', run: (await import('./basic-usage.js')).runAllExamples },
    { name: '性能测试', run: (await import('./performance-test.js')).runPerformanceTests },
    { name: '集群模式', run: (await import('./cluster-mode.js')).runClusterExamples },
    { name: '最佳实践', run: (await import('./best-practices.js')).runBestPractices }
  ];

  for (const example of examples) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`运行示例: ${example.name}`);
    console.log(`${'='.repeat(50)}`);
    
    try {
      await example.run();
    } catch (error) {
      console.error(`示例 ${example.name} 执行失败:`, error);
    }
  }

  console.log('\n所有示例执行完成!');
}

export default runAllExamples;