const axios = require('axios');
const { faker } = require('@faker-js/faker');
const { performance } = require('perf_hooks');
const fs = require('fs');
const Table = require('cli-table3');

class SearchApiTester {
    constructor(baseURL = 'http://localhost:3000', concurrency = 5, totalRequests = 100, duration = 60) {
        this.baseURL = baseURL;
        this.concurrency = concurrency;
        this.totalRequests = totalRequests;
        this.duration = duration; // 测试持续时间（秒）
        this.mode = totalRequests ? 'requests' : 'duration'; // 模式：按请求数或按时间
        this.results = {
            success: 0,
            failed: 0,
            errors: [],
            responseTimes: [],
            throughput: 0,
            startTime: 0,
            endTime: 0
        };
        this.keywords = this.generateKeywords(1000);
        this.requestsCompleted = 0;
        this.throughputHistory = []; // 吞吐量历史记录
    }

    generateKeywords(count) {
        const keywords = [];
        for (let i = 0; i < count; i++) {
            const types = [
                () => faker.word.sample(),
                () => faker.lorem.words(2),
                () => faker.commerce.productName(),
                () => faker.person.jobTitle(),
                () => faker.company.name(),
                () => faker.location.city(),
                () => faker.hacker.verb() + ' ' + faker.hacker.noun(),
                () => faker.science.chemicalElement().name,
                () => faker.animal.type() + ' ' + faker.animal.type(),
            ];
            const type = types[Math.floor(Math.random() * types.length)];
            keywords.push(type());
        }
        return keywords;
    }

    getRandomKeyword() {
        return this.keywords[Math.floor(Math.random() * this.keywords.length)];
    }

    async makeSearchRequest(requestId) {
        const keyword = this.getRandomKeyword();
        const startTime = performance.now();

        try {
            const response = await axios.get(`${this.baseURL}/google/search`, {
                params: { keyword },
                timeout: 30000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });

            const endTime = performance.now();
            const responseTime = endTime - startTime;

            const result = {
                requestId,
                keyword,
                success: response.status === 200,
                // 数据异常
                dataException: response.data?.length < 10000,
                statusCode: response.status,
                responseTime,
                data: response.data,
                timestamp: Date.now()
            };

            if (response.status === 200 && response.data?.statusCode === 200) {
                this.results.success++;
                if (!response.data?.dataLength < 10000) {
                    this.results.dataException++;
                }
                fs.writeFileSync('testsuccess.txt', JSON.stringify(response.data, null, 2), 'utf8', (err) => {
                    if (err) {
                        throw new Error('追加内容时发生错误');
                    }
                    console.log('内容已追加到文件！');
                });

            } else {
                this.results.failed++;
                this.results.errors.push({
                    requestId,
                    statusCode: response.data?.statusCode,
                    error: response.data.error,
                    keyword,
                    timestamp: Date.now()
                });
                fs.writeFileSync('testfailed.txt', JSON.stringify(response.data, null, 2), 'utf8', (err) => {
                    if (err) {
                        throw new Error('追加内容时发生错误');
                    }
                    console.log('内容已追加到文件！');
                });

            }

            this.results.responseTimes.push(responseTime);
            this.requestsCompleted++;

            return result;

        } catch (error) {
            const endTime = performance.now();
            const responseTime = endTime - startTime;

            this.results.failed++;
            this.results.responseTimes.push(responseTime);
            this.requestsCompleted++;

            const errorMsg = error.code === 'ECONNABORTED' ? '请求超时' : error.message;

            fs.appendFileSync('testfailed.txt', errorMsg, 'utf8', (err) => {
                if (err) {
                    throw new Error('追加内容时发生错误');
                }
                console.log('内容已追加到文件！');
            });
            this.results.errors.push({
                requestId,
                error: errorMsg,
                keyword,
                responseTime,
                timestamp: Date.now()
            });

            return {
                requestId,
                keyword,
                success: false,
                error: errorMsg,
                responseTime
            };
        }
    }

    // 实时统计显示
    createStatsTable() {
        return new Table({
            head: ['时间', '成功', '数据异常', '失败', 'QPS', '平均响应时间', '成功率'],
            colWidths: [12, 10, 10, 10, 12, 18, 12],
            style: { head: ['cyan'] }
        });
    }

    // 吞吐量监控
    startThroughputMonitor() {
        let lastCount = 0;
        const monitorInterval = setInterval(() => {
            const currentCount = this.requestsCompleted;
            const qps = currentCount - lastCount; // 这一秒的QPS
            lastCount = currentCount;

            const currentTime = Math.floor((performance.now() - this.results.startTime) / 1000);
            const totalRequests = this.results.success + this.results.failed;
            const avgResponseTime = this.results.responseTimes.length > 0
                ? (this.results.responseTimes.reduce((a, b) => a + b, 0) / this.results.responseTimes.length).toFixed(2)
                : 0;
            const successRate = totalRequests > 0
                ? ((this.results.success / totalRequests) * 100).toFixed(2)
                : 0;

            // 记录吞吐量历史
            this.throughputHistory.push({
                timestamp: currentTime,
                qps: qps,
                totalRequests: totalRequests,
                successRate: successRate
            });

            // 更新实时显示
            console.clear();
            const table = this.createStatsTable();
            table.push([
                `${currentTime}s`,
                this.results.success,
                this.results.dataException,
                this.results.failed,
                `${qps}/s`,
                `${avgResponseTime}ms`,
                `${successRate}%`
            ]);
            console.log(table.toString());

            // 显示进度
            if (this.mode === 'requests') {
                const progress = ((totalRequests / this.totalRequests) * 100).toFixed(1);
                console.log(`\n📊 进度: ${totalRequests}/${this.totalRequests} (${progress}%)`);
            } else {
                console.log(`\n⏰ 持续时间: ${currentTime}/${this.duration} 秒`);
            }

            console.log(`🔍 当前关键词示例: ${this.getRandomKeyword()}`);

        }, 1000);

        return monitorInterval;
    }

    async runConcurrentRequests() {
        console.log(`🚀 开始${this.mode === 'requests' ? '请求数模式' : '持续时间模式'}测试`);
        console.log(`目标URL: ${this.baseURL}`);
        console.log(`并发数: ${this.concurrency}`);

        if (this.mode === 'requests') {
            console.log(`总请求数: ${this.totalRequests}`);
        } else {
            console.log(`测试时长: ${this.duration} 秒`);
        }

        console.log('='.repeat(50));

        this.results.startTime = performance.now();

        // 启动吞吐量监控
        const monitorInterval = this.startThroughputMonitor();

        if (this.mode === 'requests') {
            // 按请求数测试
            await this.runByRequests();
        } else {
            // 按时间测试
            await this.runByDuration();
        }

        this.results.endTime = performance.now();
        clearInterval(monitorInterval);
    }

    async runByRequests() {
        const batches = Math.ceil(this.totalRequests / this.concurrency);
        console.log(`批次数: ${batches}`);
        let completedRequests = 0;

        for (let batch = 0; batch < batches; batch++) {
            const batchSize = Math.min(this.concurrency, this.totalRequests - completedRequests);
            const promises = [];

            for (let i = 0; i < batchSize; i++) {
                const requestId = completedRequests + i + 1;
                promises.push(this.makeSearchRequest(requestId));
            }

            await Promise.allSettled(promises);
            completedRequests += batchSize;

            // 动态调整延迟，避免过度压力
            const delay = Math.random() * 200 + 100; // 100-300ms随机延迟
            await this.delay(delay);
        }
    }

    async runByDuration() {
        const startTime = Date.now();
        const endTime = startTime + (this.duration * 1000);

        while (Date.now() < endTime) {
            const promises = [];
            for (let i = 0; i < this.concurrency; i++) {
                const requestId = this.requestsCompleted + i + 1;
                promises.push(this.makeSearchRequest(requestId));
            }

            await Promise.allSettled(promises);

            // 动态调整请求频率
            const currentQPS = this.throughputHistory.length > 0
                ? this.throughputHistory[this.throughputHistory.length - 1].qps
                : 0;

            // 根据当前QPS调整延迟
            let delay = 0;
            if (currentQPS > 50) {
                delay = 50; // 高负载时减少延迟
            } else if (currentQPS > 20) {
                delay = 100;
            } else {
                delay = 200;
            }

            await this.delay(delay);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 计算详细的吞吐量统计
    calculateThroughputStats() {
        if (this.throughputHistory.length === 0) return null;

        const totalTime = (this.results.endTime - this.results.startTime) / 1000; // 总时间（秒）
        const totalRequests = this.results.success + this.results.failed;
        const overallQPS = totalRequests / totalTime;

        const qpsValues = this.throughputHistory.map(h => h.qps).filter(qps => qps > 0);
        const avgQPS = qpsValues.reduce((a, b) => a + b, 0) / qpsValues.length;
        const maxQPS = Math.max(...qpsValues);
        const minQPS = Math.min(...qpsValues);

        // 计算稳定性（QPS标准差）
        const qpsVariance = qpsValues.reduce((acc, qps) => acc + Math.pow(qps - avgQPS, 2), 0) / qpsValues.length;
        const qpsStdDev = Math.sqrt(qpsVariance);

        return {
            overallQPS: overallQPS.toFixed(2),
            avgQPS: avgQPS.toFixed(2),
            maxQPS: maxQPS.toFixed(2),
            minQPS: minQPS.toFixed(2),
            qpsStdDev: qpsStdDev.toFixed(2),
            stability: ((1 - (qpsStdDev / avgQPS)) * 100).toFixed(2), // 稳定性百分比
            totalTime: totalTime.toFixed(2),
            totalRequests: totalRequests
        };
    }

    generateReport() {
        const totalTime = (this.results.endTime - this.results.startTime) / 1000;
        const totalRequests = this.results.success + this.results.failed;
        const avgResponseTime = this.results.responseTimes.reduce((sum, time) => sum + time, 0) / this.results.responseTimes.length;
        const minResponseTime = Math.min(...this.results.responseTimes);
        const maxResponseTime = Math.max(...this.results.responseTimes);

        const sortedTimes = [...this.results.responseTimes].sort((a, b) => a - b);
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.50)];
        const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.90)];
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
        const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

        const successRate = (this.results.success / totalRequests * 100).toFixed(2);

        const throughputStats = this.calculateThroughputStats();

        // 创建漂亮的表格报告
        const summaryTable = new Table({
            style: { head: ['green'] }
        });

        summaryTable.push(
            ['测试模式', this.mode === 'requests' ? `请求数 (${this.totalRequests})` : `时长 (${this.duration}s)`],
            ['并发数', this.concurrency],
            ['总请求数', totalRequests],
            ['总耗时', `${totalTime.toFixed(2)}s`],
            ['成功率', `${successRate}%`]
        );

        const throughputTable = new Table({
            head: ['吞吐量指标', '数值'],
            style: { head: ['cyan'] }
        });

        if (throughputStats) {
            throughputTable.push(
                ['总QPS', `${throughputStats.overallQPS} 请求/秒`],
                ['平均QPS', `${throughputStats.avgQPS} 请求/秒`],
                ['峰值QPS', `${throughputStats.maxQPS} 请求/秒`],
                ['最低QPS', `${throughputStats.minQPS} 请求/秒`],
                ['QPS稳定性', `${throughputStats.stability}%`],
                ['QPS标准差', `${throughputStats.qpsStdDev}`]
            );
        }

        const responseTimeTable = new Table({
            head: ['响应时间百分位', '数值 (ms)'],
            style: { head: ['yellow'] }
        });

        responseTimeTable.push(
            ['平均', avgResponseTime.toFixed(2)],
            ['最小', minResponseTime.toFixed(2)],
            ['最大', maxResponseTime.toFixed(2)],
            ['50% (中位数)', p50.toFixed(2)],
            ['90%', p90.toFixed(2)],
            ['95%', p95.toFixed(2)],
            ['99%', p99.toFixed(2)]
        );

        const report = `
📊 详细性能测试报告
${'='.repeat(50)}

🌐 测试配置:
${summaryTable.toString()}

🚀 吞吐量统计:
${throughputTable.toString()}

⏱️ 响应时间分析:
${responseTimeTable.toString()}

📈 请求分布:
   成功请求: ${this.results.success} (${successRate}%)
   失败请求: ${this.results.failed}
   错误类型分布: ${this.getErrorDistribution()}

${'='.repeat(50)}
        `;

        return report;
    }

    getErrorDistribution() {
        const errorCounts = {};
        this.results.errors.forEach(error => {
            const errorType = error.statusCode ? `HTTP ${error.statusCode}` : error.error;
            errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
        });

        return Object.entries(errorCounts)
            .map(([type, count]) => `${type}: ${count}次`)
            .join(', ') || '无错误';
    }

    saveDetailedResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `logs/throughput-test-${timestamp}.json`;

        const detailedResults = {
            testConfig: {
                baseURL: this.baseURL,
                concurrency: this.concurrency,
                mode: this.mode,
                totalRequests: this.totalRequests,
                duration: this.duration,
                timestamp: new Date().toISOString()
            },
            summary: {
                success: this.results.success,
                failed: this.results.failed,
                successRate: (this.results.success / (this.results.success + this.results.failed) * 100).toFixed(2),
                totalTime: (this.results.endTime - this.results.startTime) / 1000,
                totalRequests: this.results.success + this.results.failed
            },
            throughputStats: this.calculateThroughputStats(),
            responseTimes: {
                average: this.results.responseTimes.reduce((a, b) => a + b, 0) / this.results.responseTimes.length,
                min: Math.min(...this.results.responseTimes),
                max: Math.max(...this.results.responseTimes),
                percentiles: {
                    p50: this.results.responseTimes.sort((a, b) => a - b)[Math.floor(this.results.responseTimes.length * 0.50)],
                    p90: this.results.responseTimes.sort((a, b) => a - b)[Math.floor(this.results.responseTimes.length * 0.90)],
                    p95: this.results.responseTimes.sort((a, b) => a - b)[Math.floor(this.results.responseTimes.length * 0.95)],
                    p99: this.results.responseTimes.sort((a, b) => a - b)[Math.floor(this.results.responseTimes.length * 0.99)]
                }
            },
            throughputHistory: this.throughputHistory,
            errors: this.results.errors
        };

        fs.writeFileSync(filename, JSON.stringify(detailedResults, null, 2));
        console.log(`💾 详细结果已保存到: ${filename}`);

        // 同时保存CSV格式用于图表分析
        this.saveThroughputCSV(timestamp);
    }

    saveThroughputCSV(timestamp) {
        const csvFilename = `logs/throughput-history-${timestamp}.csv`;
        let csvContent = '时间戳(秒),QPS,总请求数,成功率%\n';

        this.throughputHistory.forEach(record => {
            csvContent += `${record.timestamp},${record.qps},${record.totalRequests},${record.successRate}\n`;
        });

        fs.writeFileSync(csvFilename, csvContent);
        console.log(`📈 吞吐量历史数据已保存到: ${csvFilename}`);
    }

    async run() {
        try {
            console.log('🔍 检查服务状态...');
            const statusResponse = await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
            console.log('✅ 服务状态正常\n');

            await this.runConcurrentRequests();

            console.log('\n' + '='.repeat(50));
            console.log(`🏁 测试完成!`);

            const report = this.generateReport();
            console.log(report);

            this.saveDetailedResults();

        } catch (error) {
            console.log('❌ 无法连接到服务，请确保服务正在运行');
            console.log(`错误详情: ${error.message}`);
        }
    }
}

// 命令行参数解析
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        baseURL: 'http://localhost:3000',
        concurrency: 5,
        totalRequests: 50,
        duration: 0 // 0表示使用请求数模式
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--url':
                config.baseURL = args[++i];
                break;
            case '--concurrency':
            case '-c':
                config.concurrency = parseInt(args[++i]);
                break;
            case '--requests':
            case '-n':
                config.totalRequests = parseInt(args[++i]);
                config.duration = 0; // 设置为请求数模式
                break;
            case '--duration':
            case '-d':
                config.duration = parseInt(args[++i]);
                config.totalRequests = 0; // 设置为时长模式
                break;
            case '--help':
            case '-h':
                console.log(`
用法: node throughput-test.js [选项]

选项:
  --url <url>          目标服务URL (默认: http://localhost:3000)
  -c, --concurrency <n> 并发数 (默认: 5)
  -n, --requests <n>    总请求数模式，请求总数 (默认: 50)
  -d, --duration <s>    持续时间模式，测试时长(秒)
  -h, --help           显示帮助信息

示例:
  # 请求数模式测试
  node throughput-test.js --url http://localhost:3000 -c 10 -n 100
  
  # 持续时间模式测试 (推荐用于吞吐量测试)
  node throughput-test.js --url http://localhost:3000 -c 20 -d 60

注意: -n 和 -d 参数互斥，使用其中一个
                `);
                process.exit(0);
        }
    }

    return config;
}

// 运行测试
async function main() {
    const config = parseArgs();

    const tester = new SearchApiTester(
        config.baseURL,
        config.concurrency,
        config.totalRequests,
        config.duration
    );

    await tester.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SearchApiTester;