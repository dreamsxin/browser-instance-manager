const axios = require('axios');
const { faker } = require("@faker-js/faker");

// 配置参数
const CONFIG = {
  baseURL: 'http://localhost:3000',
  endpoint: '/search',
  concurrency: 10, // 并发数
  totalRequests: 50, // 总请求数
  timeout: 5000, // 请求超时时间(毫秒)
};

// 统计信息
const stats = {
  success: 0,
  failure: 0,
  totalTime: 0,
  requests: [],
  resultStats: {
    totalResults: 0,
    avgResultsPerRequest: 0,
    requestsWithResults: 0,
    requestsWithoutResults: 0,
    minResults: Infinity,
    maxResults: 0,
  }
};

// 生成随机关键词
function generateRandomKeyword() {
  const keywordTypes = [
    // 科技相关
    faker.internet.domainWord(),
    faker.hacker.ingverb(),
    faker.hacker.noun(),
    faker.hacker.phrase(),
    
    // 商业相关
    faker.commerce.productName(),
    faker.commerce.department(),
    faker.company.buzzPhrase(),
    
    // 生活相关
    faker.lorem.word(),
    faker.word.sample(),
    `${faker.commerce.productAdjective()} ${faker.commerce.product()}`,
    `${faker.hacker.adjective()} ${faker.hacker.noun()}`,
    
    // 长尾关键词
    `${faker.lorem.words(3)}`,
    `how to ${faker.hacker.verb()} ${faker.hacker.noun()}`,
    `best ${faker.commerce.productName()} for ${faker.commerce.department()}`,
    
    // 品牌相关
    `${faker.company.name()} ${faker.commerce.product()}`,
  ];
  
  return faker.helpers.arrayElement(keywordTypes);
}

// 验证响应数据结构
function validateResponse(response, keyword) {
  if (!response.data) {
    throw new Error('响应中没有数据');
  }
  
  const data = response.data;
  
  // 检查必需字段
  const requiredFields = ['success', 'type', 'taskId', 'keyword', 'results', 'total', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`缺少必需字段: ${field}`);
    }
  }
  
  // 检查字段类型
  if (typeof data.success !== 'boolean') {
    throw new Error('success 字段类型错误');
  }
  
  if (data.keyword !== keyword) {
    throw new Error(`关键词不匹配: 期望 "${keyword}", 实际 "${data.keyword}"`);
  }
  
  if (!Array.isArray(data.results)) {
    throw new Error('results 字段不是数组');
  }
  
  if (typeof data.total !== 'number') {
    throw new Error('total 字段类型错误');
  }
  
  // 验证 results 数组中的对象结构
  data.results.forEach((result, index) => {
    if (!result.rank || !result.title || !result.url) {
      throw new Error(`结果 ${index} 缺少必需字段`);
    }
    if (typeof result.rank !== 'number') {
      throw new Error(`结果 ${index} 的 rank 字段类型错误`);
    }
  });
  
  return data;
}

// 更新结果统计
function updateResultStats(results, total) {
  stats.resultStats.totalResults += total;
  
  if (total > 0) {
    stats.resultStats.requestsWithResults++;
  } else {
    stats.resultStats.requestsWithoutResults++;
  }
  
  stats.resultStats.minResults = Math.min(stats.resultStats.minResults, total);
  stats.resultStats.maxResults = Math.max(stats.resultStats.maxResults, total);
}

// 发送单个请求
async function sendRequest(requestId) {
  const keyword = generateRandomKeyword();
  const startTime = Date.now();
  
  try {
    const response = await axios({
      method: 'POST',
      url: `${CONFIG.baseURL}${CONFIG.endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        keyword: keyword,
      },
      timeout: CONFIG.timeout,
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 验证响应数据
    const responseData = validateResponse(response, keyword);
    
    // 更新统计信息
    stats.success++;
    stats.totalTime += duration;
    updateResultStats(responseData.results, responseData.total);
    
    stats.requests.push({
      id: requestId,
      keyword: keyword,
      taskId: responseData.taskId,
      status: response.status,
      duration: duration,
      success: true,
      totalResults: responseData.total,
      type: responseData.type,
      timestamp: responseData.timestamp,
    });
    
    console.log(`✅ 请求 ${requestId} 成功 | 关键词: "${keyword}" | 结果数: ${responseData.total} | 耗时: ${duration}ms | 任务ID: ${responseData.taskId}`);
    
    return { 
      success: true, 
      duration, 
      keyword, 
      status: response.status,
      taskId: responseData.taskId,
      totalResults: responseData.total,
      type: responseData.type
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    stats.failure++;
    stats.requests.push({
      id: requestId,
      keyword: keyword,
      error: error.message,
      duration: duration,
      success: false,
    });
    
    console.log(`❌ 请求 ${requestId} 失败 | 关键词: "${keyword}" | 错误: ${error.message}`);
    
    return { success: false, duration, keyword, error: error.message };
  }
}

// 创建延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 执行并发测试
async function runConcurrentTest() {
  console.log('🚀 开始并发测试搜索API...');
  console.log(`📊 配置: ${CONFIG.concurrency} 并发, ${CONFIG.totalRequests} 总请求数`);
  console.log('─'.repeat(80));
  
  const startTime = Date.now();
  const batches = Math.ceil(CONFIG.totalRequests / CONFIG.concurrency);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * CONFIG.concurrency;
    const batchEnd = Math.min(batchStart + CONFIG.concurrency, CONFIG.totalRequests);
    const batchSize = batchEnd - batchStart;
    
    console.log(`\n🔄 执行第 ${batch + 1}/${batches} 批请求 (${batchSize} 个请求)`);
    
    // 创建当前批次的请求
    const batchPromises = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(sendRequest(i + 1));
    }
    
    // 等待当前批次完成
    await Promise.all(batchPromises);
    
    // 批次间延迟（可选）
    if (batch < batches - 1) {
      await delay(100);
    }
  }
  
  const totalDuration = Date.now() - startTime;
  
  // 计算平均结果数
  stats.resultStats.avgResultsPerRequest = stats.resultStats.requestsWithResults > 0 
    ? (stats.resultStats.totalResults / stats.resultStats.requestsWithResults).toFixed(2)
    : 0;
  
  // 如果所有请求都没有结果，重置 minResults
  if (stats.resultStats.minResults === Infinity) {
    stats.resultStats.minResults = 0;
  }
  
  // 输出统计结果
  console.log('\n' + '='.repeat(80));
  console.log('📈 搜索API测试结果统计');
  console.log('='.repeat(80));
  
  const successRate = (stats.success / CONFIG.totalRequests * 100).toFixed(2);
  const avgResponseTime = stats.success > 0 ? (stats.totalTime / stats.success).toFixed(2) : 0;
  
  const successfulRequests = stats.requests.filter(r => r.success);
  const failedRequests = stats.requests.filter(r => !r.success);
  
  const minTime = successfulRequests.length > 0 
    ? Math.min(...successfulRequests.map(r => r.duration))
    : 0;
  const maxTime = successfulRequests.length > 0
    ? Math.max(...successfulRequests.map(r => r.duration))
    : 0;
  
  console.log(`📊 基本统计:`);
  console.log(`   总请求数: ${CONFIG.totalRequests}`);
  console.log(`   并发数: ${CONFIG.concurrency}`);
  console.log(`   成功: ${stats.success}`);
  console.log(`   失败: ${stats.failure}`);
  console.log(`   成功率: ${successRate}%`);
  console.log(`   总耗时: ${totalDuration}ms`);
  console.log(`   平均响应时间: ${avgResponseTime}ms`);
  console.log(`   最快响应: ${minTime}ms`);
  console.log(`   最慢响应: ${maxTime}ms`);
  console.log(`   吞吐量: ${(CONFIG.totalRequests / (totalDuration / 1000)).toFixed(2)} 请求/秒`);
  
  console.log(`\n🔍 搜索结果统计:`);
  console.log(`   总结果数: ${stats.resultStats.totalResults}`);
  console.log(`   平均每请求结果数: ${stats.resultStats.avgResultsPerRequest}`);
  console.log(`   有结果的请求: ${stats.resultStats.requestsWithResults}`);
  console.log(`   无结果的请求: ${stats.resultStats.requestsWithoutResults}`);
  console.log(`   最少结果数: ${stats.resultStats.minResults}`);
  console.log(`   最多结果数: ${stats.resultStats.maxResults}`);
  
  // 输出一些示例请求
  console.log('\n📝 成功请求示例:');
  const sampleRequests = stats.requests
    .filter(req => req.success)
    .slice(0, 5)
    .map(req => `   📍 "${req.keyword}" → ${req.totalResults} 个结果 (任务ID: ${req.taskId})`)
    .join('\n');
  console.log(sampleRequests);
  
  // 输出使用的关键词分布
  const keywordLengths = stats.requests.map(req => req.keyword.length);
  const avgKeywordLength = (keywordLengths.reduce((a, b) => a + b, 0) / keywordLengths.length).toFixed(1);
  console.log(`\n📖 关键词统计:`);
  console.log(`   平均关键词长度: ${avgKeywordLength} 字符`);
  console.log(`   最短关键词: ${Math.min(...keywordLengths)} 字符`);
  console.log(`   最长关键词: ${Math.max(...keywordLengths)} 字符`);
  
  if (failedRequests.length > 0) {
    console.log('\n❌ 失败请求示例:');
    failedRequests.slice(0, 3).forEach(req => {
      console.log(`   🔴 请求 ${req.id}: "${req.keyword}" - ${req.error}`);
    });
  }
  
  // 性能评级
  console.log('\n🏆 性能评级:');
  const avgTime = parseFloat(avgResponseTime);
  if (avgTime < 100) {
    console.log('   💚 优秀 - 响应速度很快');
  } else if (avgTime < 500) {
    console.log('   💛 良好 - 响应速度适中');
  } else if (avgTime < 1000) {
    console.log('   🧡 一般 - 响应速度较慢');
  } else {
    console.log('   ❌ 较差 - 响应速度需要优化');
  }
  
  if (successRate >= 99) {
    console.log('   💚 优秀 - 成功率很高');
  } else if (successRate >= 95) {
    console.log('   💛 良好 - 成功率不错');
  } else if (successRate >= 90) {
    console.log('   🧡 一般 - 成功率有待提高');
  } else {
    console.log('   ❌ 较差 - 成功率需要改善');
  }
}

// 运行测试
runConcurrentTest().catch(console.error);