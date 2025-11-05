const axios = require('axios');
const { performance } = require('perf_hooks');
const cliProgress = require('cli-progress');
const { faker } = require('@faker-js/faker');

class ConcurrencyTestClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
  }

  /**
   * 生成测试URL列表
   */
  generateTestWords(count = 10) {
    const words = [];

    for (let i = 0; i < count; i++) {
      //const domain = domains[i % domains.length];

      // 生成随机搜索词
      const keyword = faker.word.sample();
      words.push(keyword);
    }

    return words;
  }

  /**
   * 单次请求测试
   */
  async singleRequest(word, requestId) {
    const startTime = performance.now();
    
    try {
      const response = await this.client.post('/scrape', {
        word,
        timeout: 30000
      });

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      return {
        id: requestId,
        word,
        success: true,
        responseTime,
        status: response.status,
        dataLength: response.data?.content?.length || 0,
        title: response.data?.title || 'N/A'
      };
    } catch (error) {
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      return {
        id: requestId,
        word,
        success: false,
        responseTime,
        error: error.response?.data?.error || error.message,
        status: error.response?.status || 500
      };
    }
  }

  /**
   * 批量并发测试
   */
  async runConcurrencyTest(options = {}) {
    const {
      concurrency = 5,
      totalRequests = 20,
      delayBetweenBatches = 500,
      testWords = null
    } = options;

    console.log(`🚀 开始并发测试`);
    console.log(`📊 配置: ${concurrency} 并发, ${totalRequests} 总请求数`);
    console.log('─'.repeat(50));

    const words = testWords || this.generateTestWords(totalRequests);
    const results = [];
    const batches = [];
    const startTime = performance.now();
    const progressBar = new cliProgress.SingleBar({
      format: '进度 |{bar}| {percentage}% | {value}/{total} 请求，耗时：{duration}s',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true
    });

    progressBar.start(totalRequests, 0);

    // 创建批次
    for (let i = 0; i < totalRequests; i += concurrency) {
      const batch = words.slice(i, i + concurrency).map((word, index) => ({
        word,
        id: i + index
      }));
      batches.push(batch);
    }

    let completedRequests = 0;

    // 执行批次
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      console.log(`\n🔄 执行批次 ${batchIndex + 1}/${batches.length}, 并发数: ${batch.length}`);

      const batchPromises = batch.map(({ word, id }) => 
        this.singleRequest(word, id)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            id: completedRequests,
            url: 'unknown',
            success: false,
            responseTime: 0,
            error: result.reason.message,
            status: 500
          });
        }
        completedRequests++;
        progressBar.update(completedRequests, {
          duration: Math.floor(performance.now() - startTime)
        });
      }

      // 批次间延迟
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ 等待 ${delayBetweenBatches}ms 后执行下一批次...`);
        await this.delay(delayBetweenBatches);
      }
    }

    progressBar.stop();
    const totalTime = Math.floor((performance.now() - startTime) / 1000);
    return this.generateReport(results, totalTime);
  }

  /**
   * 压力测试 - 持续发送请求
   */
  async runStressTest(options = {}) {
    const {
      duration = 60000, // 1分钟
      concurrency = 3,
      requestsPerSecond = 2
    } = options;

    console.log(`🔥 开始压力测试`);
    console.log(`📊 持续时间: ${duration}ms, 并发数: ${concurrency}, 目标RPS: ${requestsPerSecond}`);
    console.log('─'.repeat(50));

    const results = [];
    const startTime = performance.now();
    let requestCount = 0;
    const words = this.generateTestWords(100); // 预生成URL池

    const interval = setInterval(() => {
      if (performance.now() - startTime >= duration) {
        clearInterval(interval);
        return;
      }

      // 每个间隔发送一组并发请求
      for (let i = 0; i < concurrency; i++) {
        const word = words[Math.floor(Math.random() * words.length)];
        this.singleRequest(word, requestCount++)
          .then(result => results.push(result))
          .catch(error => {
            results.push({
              id: requestCount - 1,
              url: 'unknown',
              success: false,
              responseTime: 0,
              error: error.message,
              status: 500
            });
          });
      }
    }, 1000 / requestsPerSecond);

    // 等待测试完成
    await this.delay(duration + 2000); // 额外等待2秒确保所有请求完成

    clearInterval(interval);
    return this.generateReport(results, Math.floor(duration/1000));
  }

  /**
   * 生成测试报告
   */
  generateReport(results, totalTime) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const responseTimes = successful.map(r => r.responseTime);
    
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    const minResponseTime = responseTimes.length > 0 
      ? Math.min(...responseTimes) 
      : 0;
    
    const maxResponseTime = responseTimes.length > 0 
      ? Math.max(...responseTimes) 
      : 0;

    const successRate = (successful.length / results.length) * 100;

    // 修复QPS计算：使用总时间而不是最大响应时间
    const qps = totalTime > 0 ? successful.length / (totalTime / 1000) : 0;

    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');
    console.log('='.repeat(60));
    console.log(`总请求数: ${results.length}`);
    console.log(`总时间: ${totalTime.toFixed(2)}s`);
    console.log(`成功: ${successful.length}`);
    console.log(`失败: ${failed.length}`);
    console.log(`成功率: ${successRate.toFixed(2)}%`);
    console.log(`平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`最小响应时间: ${minResponseTime.toFixed(2)}ms`);
    console.log(`最大响应时间: ${maxResponseTime.toFixed(2)}ms`);
    console.log(`QPS (估算): ${(successful.length / totalTime).toFixed(2)}`);

    if (failed.length > 0) {
      console.log('\n❌ 失败请求详情:');
      failed.slice(0, 5).forEach(fail => {
        console.log(`  URL: ${fail.url}`);
        console.log(`  错误: ${fail.error}`);
        console.log(`  状态码: ${fail.status}`);
        console.log('  ──');
      });
      
      if (failed.length > 5) {
        console.log(`  ... 还有 ${failed.length - 5} 个失败请求`);
      }
    }

    // 响应时间分布
    const timeRanges = {
      '<100ms': 0,
      '100-500ms': 0,
      '500-1000ms': 0,
      '1-3s': 0,
      '3-5s': 0,
      '>5s': 0
    };

    responseTimes.forEach(time => {
      if (time < 100) timeRanges['<100ms']++;
      else if (time < 500) timeRanges['100-500ms']++;
      else if (time < 1000) timeRanges['500-1000ms']++;
      else if (time < 3000) timeRanges['1-3s']++;
      else if (time < 5000) timeRanges['3-5s']++;
      else timeRanges['>5s']++;
    });

    console.log('\n⏱️  响应时间分布:');
    Object.entries(timeRanges).forEach(([range, count]) => {
      const percentage = (count / responseTimes.length) * 100;
      console.log(`  ${range}: ${count} (${percentage.toFixed(1)}%)`);
    });

    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      successRate,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      results
    };
  }

  /**
   * 测试服务器健康状态
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      console.log('✅ 服务器健康状态:');
      console.log('   状态:', response.data.status);
      console.log('   并发统计:', response.data.concurrency);
      return true;
    } catch (error) {
      console.log('❌ 服务器不可用:', error.message);
      return false;
    }
  }

  /**
   * 调整服务器并发设置
   */
  async setConcurrency(limit) {
    try {
      const response = await this.client.put('/concurrency', {
        maxConcurrent: limit
      });
      console.log(`✅ 并发数已设置为: ${limit}`);
      return response.data;
    } catch (error) {
      console.log('❌ 设置并发数失败:', error.message);
      return null;
    }
  }

  /**
   * 获取当前并发状态
   */
  async getConcurrencyStatus() {
    try {
      const response = await this.client.get('/concurrency');
      console.log('📈 当前并发状态:', response.data);
      return response.data;
    } catch (error) {
      console.log('❌ 获取并发状态失败:', error.message);
      return null;
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 命令行界面
 */
async function main() {
  const client = new ConcurrencyTestClient();
  
  // 检查服务器状态
  const isHealthy = await client.checkHealth();
  if (!isHealthy) {
    console.log('请先启动网页抓取服务: npm start');
    return;
  }

  // 显示当前并发状态
  await client.getConcurrencyStatus();

  // 命令行参数解析
  const args = process.argv.slice(2);
  const testType = args[0] || 'concurrency';

  switch (testType) {
    case 'concurrency':
      // 并发测试
      await client.runConcurrencyTest({
        concurrency: 3,
        totalRequests: 15,
        delayBetweenBatches: 500
      });
      break;

    case 'stress':
      // 压力测试
      await client.runStressTest({
        duration: 30000, // 30秒
        concurrency: 2,
        requestsPerSecond: 1
      });
      break;

    case 'custom':
      // 自定义测试
      const concurrency = parseInt(args[1]) || 3;
      const totalRequests = parseInt(args[2]) || 10;
      
      await client.setConcurrency(concurrency);
      await client.runConcurrencyTest({
        concurrency,
        totalRequests,
        delayBetweenBatches: 500
      });
      break;

    default:
      console.log('可用测试类型:');
      console.log('  node test-client.js concurrency  - 并发测试');
      console.log('  node test-client.js stress       - 压力测试');
      console.log('  node test-client.js custom <并发数> <总请求数> - 自定义测试');
      break;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ConcurrencyTestClient;