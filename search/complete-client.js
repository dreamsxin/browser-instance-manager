const WebSocket = require('ws');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

class CompleteSearchClient {
  constructor(url = 'ws://localhost:8080') {
    this.ws = new WebSocket(url);
    this.stats = null;
    this.recentActivity = [];
    this.initialKeepAliveCompleted = false;
    this.setupEventHandlers();
    this.setupCommandInterface();
    
    this.keepAliveLogs = [];
    this.searchResults = [];
    this.connectionStatus = 'connecting';
    
    // 消息类型处理器映射
    this.messageHandlers = {
      'initial_stats': this.handleInitialStats.bind(this),
      'stats_response': this.handleStatsResponse.bind(this),
      'keepalive_stats_update': this.handleKeepAliveStatsUpdate.bind(this),
      'keepalive_start': this.handleKeepAliveStart.bind(this),
      'keepalive_complete': this.handleKeepAliveComplete.bind(this),
      'keepalive_scheduled': this.handleKeepAliveScheduled.bind(this),
      'initial_keepalive_complete': this.handleInitialKeepAliveComplete.bind(this),
      'status': this.handleStatus.bind(this),
      'result': this.handleResult.bind(this),
      'error': this.handleError.bind(this)
    };
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('🔗 已连接到搜索服务');
      this.connectionStatus = 'connected';
      console.log('📊 开始监控保活机制和页面状态...\n');
      
      // 请求初始统计信息
      this.ws.send(JSON.stringify({ type: 'get_stats' }));
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ 解析消息错误:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('\n🔌 连接已关闭');
      this.connectionStatus = 'disconnected';
      process.exit(0);
    });

    this.ws.on('error', (error) => {
      console.error('❌ 连接错误:', error);
      this.connectionStatus = 'error';
    });
  }

  handleMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    const handler = this.messageHandlers[message.type];
    
    if (handler) {
      handler(message, timestamp);
    } else {
      console.log(`❓ [${timestamp}] 未知消息类型: ${message.type}`);
      console.log('   消息内容:', JSON.stringify(message, null, 2));
    }
  }

  // 消息类型处理器
  handleInitialStats(message, timestamp) {
    this.stats = message.stats;
    this.recentActivity = message.recentActivity || [];
    this.initialKeepAliveCompleted = message.initialKeepAliveCompleted || false;
    this.displayDashboard();
  }

  handleStatsResponse(message, timestamp) {
    this.stats = message.stats;
    this.recentActivity = message.recentActivity || [];
    this.initialKeepAliveCompleted = message.initialKeepAliveCompleted || false;
    this.displayDashboard();
  }

  handleKeepAliveStatsUpdate(message, timestamp) {
    this.stats = message.stats;
    this.recentActivity = message.recentActivity || [];
    this.updateDashboard();
  }

  handleKeepAliveStart(message, timestamp) {
    this.keepAliveLogs.unshift({
      type: 'start',
      pageIndex: message.pageIndex,
      timestamp: new Date(message.timestamp)
    });
    this.keepAliveLogs = this.keepAliveLogs.slice(0, 50);
    console.log(`\n🟡 [${timestamp}] 页面 ${message.pageIndex} 开始保活操作`);
  }

  handleKeepAliveComplete(message, timestamp) {
    this.keepAliveLogs.unshift({
      type: message.success ? 'success' : 'error',
      pageIndex: message.pageIndex,
      timestamp: new Date(message.timestamp),
      duration: message.duration,
      openedNewPages: message.openedNewPages || 0
    });
    this.keepAliveLogs = this.keepAliveLogs.slice(0, 50);
    
    const statusIcon = message.success ? '🟢' : '🔴';
    const newPagesInfo = message.openedNewPages > 0 ? `, 新页面: ${message.openedNewPages}个` : '';
    console.log(`${statusIcon} [${timestamp}] 页面 ${message.pageIndex} 保活${message.success ? '成功' : '失败'} (${message.duration}ms${newPagesInfo})`);
  }

  handleKeepAliveScheduled(message, timestamp) {
    console.log(`⏰ [${timestamp}] 页面 ${message.pageIndex} 下次保活: ${Math.round(message.intervalMinutes)}分钟后`);
  }

  handleInitialKeepAliveComplete(message, timestamp) {
    this.initialKeepAliveCompleted = true;
    console.log(`\n🎉 初始保活全部完成! 成功: ${message.successCount}, 失败: ${message.failCount}, 总计: ${message.totalCount}`);
  }

  handleStatus(message, timestamp) {
    console.log(`📡 [${timestamp}] [${message.status}] ${message.message}`);
  }

  handleResult(message, timestamp) {
    this.searchResults.unshift({
      keyword: message.keyword,
      results: message.results,
      total: message.total,
      timestamp: new Date(message.timestamp)
    });
    this.searchResults = this.searchResults.slice(0, 20);
    
    console.log(`\n🔍 [${timestamp}] === 搜索结果: "${message.keyword}" ===`);
    
    if (message.total === 0) {
      console.log('❌ 未找到相关结果');
      console.log('💡 可能的原因:');
      console.log('   - 搜索词太特殊或拼写错误');
      console.log('   - 网络连接问题');
      console.log('   - 谷歌反爬虫机制触发');
      console.log('   - 页面加载不完整');
    } else {
      console.log(`找到 ${message.total} 个结果:`);
      message.results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title}`);
        console.log(`   链接: ${result.url}`);
        if (result.description) {
          const desc = result.description.length > 100 ? 
            result.description.substring(0, 100) + '...' : result.description;
          console.log(`   描述: ${desc}`);
        }
        console.log('   ---');
      });
    }
  }

  handleError(message, timestamp) {
    console.error(`💥 [${timestamp}] [错误] ${message.message}`);
    if (message.taskId) {
      console.log(`   任务ID: ${message.taskId}`);
    }
  }

  displayDashboard() {
    // 清屏
    process.stdout.write('\x1Bc');
    
    console.log('='.repeat(80));
    console.log('🔄 谷歌搜索服务 - 完整监控面板');
    console.log('='.repeat(80));
    
    // 连接状态
    const statusIcons = {
      'connected': '🟢',
      'connecting': '🟡',
      'disconnected': '🔴',
      'error': '💥'
    };
    console.log(`\n📡 连接状态: ${statusIcons[this.connectionStatus]} ${this.connectionStatus}`);
    
    // 初始保活状态
    const initialStatus = this.initialKeepAliveCompleted ? '✅ 已完成' : '🟡 进行中';
    console.log(`🎯 初始保活状态: ${initialStatus}`);
    
    // 总体统计
    if (this.stats) {
      console.log('\n📊 总体统计:');
      console.log(`   总执行次数: ${this.stats.totalExecutions}`);
      console.log(`   成功次数: ${this.stats.successfulExecutions}`);
      console.log(`   失败次数: ${this.stats.failedExecutions}`);
      console.log(`   成功率: ${this.stats.successRate}`);
      console.log(`   最后执行: ${this.stats.lastExecution ? new Date(this.stats.lastExecution).toLocaleString() : '暂无'}`);
      
      // 页面详细统计
      if (this.stats.pageStats && Object.keys(this.stats.pageStats).length > 0) {
        console.log('\n📄 页面统计:');
        console.log('   ┌─────────┬────────┬─────────┬─────────┬────────────┐');
        console.log('   │  页面   │  总次数 │  成功   │  失败   │   成功率   │');
        console.log('   ├─────────┼────────┼─────────┼─────────┼────────────┤');
        
        Object.entries(this.stats.pageStats).forEach(([page, stats]) => {
          console.log(`   │ ${page.padEnd(7)} │ ${stats.total.toString().padEnd(6)} │ ${stats.success.toString().padEnd(7)} │ ${stats.fail.toString().padEnd(7)} │ ${stats.successRate.padEnd(10)} │`);
        });
        console.log('   └─────────┴────────┴─────────┴─────────┴────────────┘');
      }
    } else {
      console.log('\n📊 统计信息: 加载中...');
    }
    
    // 最近活动
    console.log('\n📋 最近活动 (最新10条):');
    if (this.recentActivity.length > 0) {
      this.recentActivity.slice(0, 10).forEach(activity => {
        const time = new Date(activity.timestamp).toLocaleTimeString();
        const status = activity.success ? '✅' : '❌';
        const keyword = activity.keyword ? `"${activity.keyword}"` : '未知';
        const newPagesInfo = activity.openedNewPages > 0 ? `, 新页面: ${activity.openedNewPages}` : '';
        console.log(`   ${status} [${time}] 页面 ${activity.pageIndex}: ${keyword} (${activity.duration}ms${newPagesInfo})`);
      });
    } else {
      console.log('   暂无活动记录');
    }
    
    // 最近搜索结果
    console.log('\n🔍 最近搜索 (最新5条):');
    if (this.searchResults.length > 0) {
      this.searchResults.slice(0, 5).forEach((result, index) => {
        const time = result.timestamp.toLocaleTimeString();
        const resultIcon = result.total > 0 ? '✅' : '❌';
        console.log(`   ${resultIcon} [${time}] "${result.keyword}" - ${result.total}个结果`);
      });
    } else {
      console.log('   暂无搜索记录');
    }
    
    this.displayHelp();
  }

  updateDashboard() {
    // 简单的更新，避免频繁清屏
    const lastLog = this.keepAliveLogs[0];
    if (lastLog) {
      const time = lastLog.timestamp.toLocaleTimeString();
      let logLine = '';
      
      switch (lastLog.type) {
        case 'start':
          logLine = `🟡 [${time}] 页面 ${lastLog.pageIndex} 开始保活`;
          break;
        case 'success':
          const newPagesInfo = lastLog.openedNewPages > 0 ? `, 新页面: ${lastLog.openedNewPages}个` : '';
          logLine = `🟢 [${time}] 页面 ${lastLog.pageIndex} 保活成功 (${lastLog.duration}ms${newPagesInfo})`;
          break;
        case 'error':
          logLine = `🔴 [${time}] 页面 ${lastLog.pageIndex} 保活失败 (${lastLog.duration}ms)`;
          break;
      }
      
      // 移动光标并更新最后一行
      process.stdout.write('\r\x1b[K'); // 清除当前行
      console.log(logLine);
      this.displayHelp();
    }
  }

  displayHelp() {
    console.log('\n💡 命令提示:');
    console.log('   r - 刷新统计信息');
    console.log('   s - 发送测试搜索请求');
    console.log('   s2 - 发送两次测试搜索请求');
    console.log('   m [关键词] - 手动发送搜索请求 (例如: m 人工智能)');
    console.log('   f [页码] - 强制指定页面执行保活 (例如: f 1)');
    console.log('   l - 显示最近搜索详情');
    console.log('   c - 清空当前屏幕');
    console.log('   q - 退出监控');
    console.log('   h - 显示帮助');
    console.log('─'.repeat(80));
    process.stdout.write('请输入命令: ');
  }

  setupCommandInterface() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    rl.on('line', (input) => {
      const args = input.trim().split(' ');
      const command = args[0].toLowerCase();
      
      switch (command) {
        case 'r':
          this.ws.send(JSON.stringify({ type: 'get_stats' }));
          console.log('🔄 刷新统计信息...');
          break;

        case 's':
          this.sendTestSearch();
          break;

        case 's2':
          // 发送两次测试搜索请求
          this.sendTestSearch();
          this.sendTestSearch();
          break;
          
        case 'm':
          if (args.length > 1) {
            const keyword = args.slice(1).join(' ');
            this.sendManualSearch(keyword);
          } else {
            console.log('❌ 请指定搜索关键词，例如: m 人工智能');
          }
          break;
          
        case 'f':
          if (args.length > 1) {
            const pageIndex = parseInt(args[1]);
            if (!isNaN(pageIndex) && pageIndex >= 1 && pageIndex <= 10) {
              this.ws.send(JSON.stringify({ 
                type: 'force_keepalive', 
                pageIndex: pageIndex 
              }));
              console.log(`🔧 强制页面 ${pageIndex} 执行保活操作`);
            } else {
              console.log('❌ 无效的页面编号，请输入 1-10 之间的数字');
            }
          } else {
            console.log('❌ 请指定页面编号，例如: f 1');
          }
          break;
          
        case 'l':
          this.showRecentSearches();
          break;
          
        case 'c':
          process.stdout.write('\x1Bc');
          this.displayDashboard();
          break;
          
        case 'q':
          console.log('👋 退出监控...');
          this.ws.close();
          rl.close();
          break;
          
        case 'h':
          this.displayHelp();
          break;
          
        default:
          console.log('❓ 未知命令，输入 h 查看帮助');
          this.displayHelp();
          break;
      }
    });
  }

  sendTestSearch() {
    const testKeywords = [
      '人工智能', '机器学习', '深度学习', '神经网络',
      '大数据', '云计算', '物联网', '区块链',
      'Node.js', 'Python', 'Java', 'JavaScript',
      'Web开发', '移动应用', '数据科学', '人工智能应用'
    ];

    const randomKeyword = testKeywords[Math.floor(Math.random() * testKeywords.length)];
    this.sendSearchRequest(randomKeyword);
  }

  sendManualSearch(keyword) {
    this.sendSearchRequest(keyword);
  }

  sendSearchRequest(keyword) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.log('❌ 连接未就绪，请检查服务状态');
      return;
    }
    
    const searchTask = {
      type: 'search',
      keyword: keyword,
      taskId: uuidv4()
    };
    
    this.ws.send(JSON.stringify(searchTask));
    console.log(`🔍 发送搜索请求: "${keyword}" (ID: ${searchTask.taskId})`);
  }

  showRecentSearches() {
    console.log('\n📋 最近搜索详情:');
    if (this.searchResults.length > 0) {
      this.searchResults.slice(0, 5).forEach((result, index) => {
        console.log(`\n${index + 1}. [${result.timestamp.toLocaleTimeString()}] "${result.keyword}"`);
        console.log(`   结果数量: ${result.total}`);
        if (result.total > 0) {
          console.log('   前3个结果:');
          result.results.slice(0, 3).forEach((item, itemIndex) => {
            console.log(`     ${itemIndex + 1}. ${item.title}`);
          });
        }
      });
    } else {
      console.log('   暂无搜索记录');
    }
    console.log('\n' + '─'.repeat(80));
  }
}

// 启动客户端
if (require.main === module) {
  const client = new CompleteSearchClient();
  
  // 错误处理
  process.on('uncaughtException', (error) => {
    console.error('💥 未捕获异常:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
  });
}

module.exports = CompleteSearchClient;