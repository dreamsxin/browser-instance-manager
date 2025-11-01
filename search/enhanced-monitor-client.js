const WebSocket = require('ws');
const readline = require('readline');

class EnhancedMonitorClient {
  constructor(url = 'ws://localhost:8080') {
    this.ws = new WebSocket(url);
    this.stats = null;
    this.recentActivity = [];
    this.initialKeepAliveCompleted = false;
    this.setupEventHandlers();
    this.setupCommandInterface();
    
    this.keepAliveLogs = [];
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('🔗 已连接到搜索服务监控端');
      console.log('📊 开始监控保活机制和页面状态...\n');
      
      // 请求初始统计信息
      this.ws.send(JSON.stringify({ type: 'get_stats' }));
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error('解析消息错误:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('\n🔌 监控连接已关闭');
      process.exit(0);
    });

    this.ws.on('error', (error) => {
      console.error('监控连接错误:', error);
    });
  }

  handleMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    
    switch (message.type) {
      case 'initial_stats':
      case 'stats_response':
        this.stats = message.stats;
        this.recentActivity = message.recentActivity || [];
        this.initialKeepAliveCompleted = message.initialKeepAliveCompleted || false;
        this.displayDashboard();
        break;
        
      case 'keepalive_stats_update':
        this.stats = message.stats;
        this.recentActivity = message.recentActivity || [];
        this.updateDashboard();
        break;
        
      case 'keepalive_start':
        this.keepAliveLogs.unshift({
          type: 'start',
          pageIndex: message.pageIndex,
          timestamp: new Date(message.timestamp)
        });
        this.keepAliveLogs = this.keepAliveLogs.slice(0, 50);
        console.log(`\n🟡 [${timestamp}] 页面 ${message.pageIndex} 开始保活操作`);
        break;
        
      case 'keepalive_complete':
        this.keepAliveLogs.unshift({
          type: message.success ? 'success' : 'error',
          pageIndex: message.pageIndex,
          timestamp: new Date(message.timestamp),
          duration: message.duration
        });
        this.keepAliveLogs = this.keepAliveLogs.slice(0, 50);
        const statusIcon = message.success ? '🟢' : '🔴';
        console.log(`${statusIcon} [${timestamp}] 页面 ${message.pageIndex} 保活${message.success ? '成功' : '失败'} (${message.duration}ms)`);
        break;
        
      case 'keepalive_scheduled':
        console.log(`⏰ [${timestamp}] 页面 ${message.pageIndex} 下次保活: ${Math.round(message.intervalMinutes)}分钟后`);
        break;
        
      case 'initial_keepalive_complete':
        this.initialKeepAliveCompleted = true;
        console.log(`\n🎉 初始保活全部完成! 成功: ${message.successCount}, 失败: ${message.failCount}, 总计: ${message.totalCount}`);
        break;
        
      default:
        break;
    }
  }

  displayDashboard() {
    // 清屏
    process.stdout.write('\x1Bc');
    
    console.log('='.repeat(80));
    console.log('🔄 谷歌搜索服务 - 增强版保活机制监控面板');
    console.log('='.repeat(80));
    
    // 初始保活状态
    const initialStatus = this.initialKeepAliveCompleted ? '✅ 已完成' : '🟡 进行中';
    console.log(`\n🎯 初始保活状态: ${initialStatus}`);
    
    // 总体统计
    console.log('\n📊 总体统计:');
    console.log(`   总执行次数: ${this.stats.totalExecutions}`);
    console.log(`   成功次数: ${this.stats.successfulExecutions}`);
    console.log(`   失败次数: ${this.stats.failedExecutions}`);
    console.log(`   成功率: ${this.stats.successRate}`);
    console.log(`   最后执行: ${this.stats.lastExecution ? new Date(this.stats.lastExecution).toLocaleString() : '暂无'}`);
    
    // 页面详细统计
    console.log('\n📄 页面统计:');
    console.log('   ┌─────────┬────────┬─────────┬─────────┬────────────┐');
    console.log('   │  页面   │  总次数 │  成功   │  失败   │   成功率   │');
    console.log('   ├─────────┼────────┼─────────┼─────────┼────────────┤');
    
    Object.entries(this.stats.pageStats).forEach(([page, stats]) => {
      console.log(`   │ ${page.padEnd(7)} │ ${stats.total.toString().padEnd(6)} │ ${stats.success.toString().padEnd(7)} │ ${stats.fail.toString().padEnd(7)} │ ${stats.successRate.padEnd(10)} │`);
    });
    console.log('   └─────────┴────────┴─────────┴─────────┴────────────┘');
    
    // 最近活动
    console.log('\n📋 最近活动 (最新10条):');
    if (this.recentActivity.length > 0) {
      this.recentActivity.slice(0, 10).forEach(activity => {
        const time = new Date(activity.timestamp).toLocaleTimeString();
        const status = activity.success ? '✅' : '❌';
        const keyword = activity.keyword ? `"${activity.keyword}"` : '未知';
        console.log(`   ${status} [${time}] 页面 ${activity.pageIndex}: ${keyword} (${activity.duration}ms)`);
      });
    } else {
      console.log('   暂无活动记录');
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
          logLine = `🟢 [${time}] 页面 ${lastLog.pageIndex} 保活成功 (${lastLog.duration}ms)`;
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
    console.log('   f [页码] - 强制指定页面执行保活 (例如: f 1)');
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
      'Node.js', 'Python', 'Java', 'JavaScript'
    ];
    
    const randomKeyword = testKeywords[Math.floor(Math.random() * testKeywords.length)];
    const searchTask = {
      type: 'search',
      keyword: randomKeyword
    };
    
    this.ws.send(JSON.stringify(searchTask));
    console.log(`🔍 发送测试搜索: "${randomKeyword}"`);
  }
}

// 启动监控客户端
if (require.main === module) {
  const monitor = new EnhancedMonitorClient();
  
  // 错误处理
  process.on('uncaughtException', (error) => {
    console.error('未捕获异常:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
  });
}

module.exports = EnhancedMonitorClient;