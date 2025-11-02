const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class HttpProxyService {
  constructor() {
    this.app = express();
    this.wsClient = null;
    this.pendingTasks = new Map(); // taskId -> { resolve, reject, timeout }
    this.wsUrl = 'ws://localhost:8080';
    this.httpPort = 3000;
    this.connectionTimeout = 10000; // 10秒连接超时
    this.taskTimeout = 60000; // 60秒任务超时
    
    this.setupMiddleware();
    this.setupRoutes();
    this.connectToWebSocket();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS中间件
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      const wsStatus = this.wsClient && this.wsClient.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
      res.json({
        status: 'ok',
        service: 'HTTP Proxy Service',
        websocket: wsStatus,
        pendingTasks: this.pendingTasks.size,
        timestamp: new Date().toISOString()
      });
    });

    // 搜索接口
    this.app.post('/search', async (req, res) => {
      try {
        const { keyword } = req.body;
        
        if (!keyword) {
          return res.status(400).json({
            success: false,
            error: '缺少keyword参数'
          });
        }

        // 检查WebSocket连接状态
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
          return res.status(503).json({
            success: false,
            error: 'WebSocket服务未连接，请稍后重试'
          });
        }

        console.log(`🌐 HTTP 接收到搜索请求: ${keyword}`);
        
        // 执行搜索并等待结果
        const result = await this.executeSearch(keyword);
        
        res.json({
          success: true,
          ...result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('💥 HTTP 搜索错误:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 获取统计信息
    this.app.get('/stats', async (req, res) => {
      try {
        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
          return res.status(503).json({
            success: false,
            error: 'WebSocket服务未连接'
          });
        }

        const stats = await this.getStats();
        res.json({
          success: true,
          ...stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('💥 获取统计信息错误:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 强制保活
    this.app.post('/keepalive/force', async (req, res) => {
      try {
        const { pageIndex } = req.body;
        
        if (!pageIndex) {
          return res.status(400).json({
            success: false,
            error: '缺少pageIndex参数'
          });
        }

        if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
          return res.status(503).json({
            success: false,
            error: 'WebSocket服务未连接'
          });
        }

        console.log(`🔧 HTTP 强制保活请求: 页面 ${pageIndex}`);
        
        await this.forceKeepAlive(pageIndex);
        
        res.json({
          success: true,
          message: `已发送页面 ${pageIndex} 的强制保活请求`,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('💥 强制保活错误:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 服务状态
    this.app.get('/status', (req, res) => {
      const wsStatus = this.getWebSocketStatus();
      res.json({
        websocket: wsStatus,
        pendingTasks: this.pendingTasks.size,
        service: 'HTTP Proxy Service',
        timestamp: new Date().toISOString()
      });
    });
  }

  connectToWebSocket() {
    console.log(`🔗 正在连接到WebSocket服务: ${this.wsUrl}`);
    
    this.wsClient = new WebSocket(this.wsUrl);
    
    this.wsClient.on('open', () => {
      console.log('✅ 已连接到WebSocket服务');
    });
    
    this.wsClient.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('💥 解析WebSocket消息错误:', error);
      }
    });
    
    this.wsClient.on('close', (code, reason) => {
      console.log(`🔌 WebSocket连接关闭: ${code} - ${reason}`);
      // 清理所有等待中的任务
      this.cleanupPendingTasks('WebSocket连接已关闭');
      
      // 尝试重新连接
      setTimeout(() => {
        console.log('🔄 尝试重新连接WebSocket...');
        this.connectToWebSocket();
      }, 5000);
    });
    
    this.wsClient.on('error', (error) => {
      console.error('💥 WebSocket连接错误:', error);
      this.cleanupPendingTasks('WebSocket连接错误');
    });
  }

  handleWebSocketMessage(message) {
    const { type, taskId } = message;
    
    // 处理搜索结果
    if (type === 'result' && taskId) {
      const task = this.pendingTasks.get(taskId);
      if (task) {
        clearTimeout(task.timeout);
        this.pendingTasks.delete(taskId);
        task.resolve(message);
        console.log(`✅ 任务 ${taskId} 完成，结果: ${message.results?.length || 0} 条`);
      }
    }
    
    // 处理错误
    else if (type === 'error' && taskId) {
      const task = this.pendingTasks.get(taskId);
      if (task) {
        clearTimeout(task.timeout);
        this.pendingTasks.delete(taskId);
        task.reject(new Error(message.message || '搜索失败'));
        console.log(`❌ 任务 ${taskId} 失败: ${message.message}`);
      }
    }
    
    // 处理状态更新（可选，用于调试）
    else if (type === 'status' && taskId) {
      console.log(`📊 任务 ${taskId} 状态: ${message.status} - ${message.message}`);
    }
    
    // 处理统计信息响应
    else if (type === 'stats_response') {
      const task = this.pendingTasks.get('get_stats');
      if (task) {
        clearTimeout(task.timeout);
        this.pendingTasks.delete('get_stats');
        task.resolve(message);
      }
    }
  }

  executeSearch(keyword) {
    return new Promise((resolve, reject) => {
      const taskId = uuidv4();
      
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('搜索任务超时'));
        }
      }, this.taskTimeout);
      
      // 保存任务信息
      this.pendingTasks.set(taskId, { resolve, reject, timeout });
      
      // 发送搜索请求
      this.wsClient.send(JSON.stringify({
        type: 'search',
        keyword,
        taskId
      }));
      
      console.log(`📨 发送搜索任务: ${keyword} (ID: ${taskId})`);
    });
  }

  getStats() {
    return new Promise((resolve, reject) => {
      const taskId = 'get_stats';
      
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('获取统计信息超时'));
        }
      }, 10000);
      
      // 保存任务信息
      this.pendingTasks.set(taskId, { resolve, reject, timeout });
      
      // 发送获取统计信息请求
      this.wsClient.send(JSON.stringify({
        type: 'get_stats'
      }));
      
      console.log(`📊 请求统计信息`);
    });
  }

  forceKeepAlive(pageIndex) {
    return new Promise((resolve, reject) => {
      this.wsClient.send(JSON.stringify({
        type: 'force_keepalive',
        pageIndex: parseInt(pageIndex)
      }));
      
      // 强制保活不需要等待响应
      resolve();
    });
  }

  cleanupPendingTasks(reason) {
    for (const [taskId, task] of this.pendingTasks) {
      clearTimeout(task.timeout);
      task.reject(new Error(reason));
    }
    this.pendingTasks.clear();
    console.log(`🧹 已清理所有等待中的任务: ${reason}`);
  }

  getWebSocketStatus() {
    if (!this.wsClient) {
      return { status: 'disconnected', message: 'WebSocket客户端未初始化' };
    }
    
    const statusMap = {
      [WebSocket.CONNECTING]: 'connecting',
      [WebSocket.OPEN]: 'connected',
      [WebSocket.CLOSING]: 'closing',
      [WebSocket.CLOSED]: 'disconnected'
    };
    
    return {
      status: statusMap[this.wsClient.readyState] || 'unknown',
      readyState: this.wsClient.readyState
    };
  }

  start() {
    this.server = this.app.listen(this.httpPort, () => {
      console.log(`🌐 HTTP代理服务启动在端口 ${this.httpPort}`);
      console.log(`   📍 健康检查: http://localhost:${this.httpPort}/health`);
      console.log(`   🔍 搜索接口: http://localhost:${this.httpPort}/search (POST)`);
      console.log(`   📊 统计信息: http://localhost:${this.httpPort}/stats (GET)`);
      console.log(`   🔧 强制保活: http://localhost:${this.httpPort}/keepalive/force (POST)`);
      console.log(`   📈 服务状态: http://localhost:${this.httpPort}/status (GET)`);
      console.log(`   🔗 WebSocket目标: ${this.wsUrl}`);
    });
  }

  async shutdown() {
    console.log('🛑 关闭HTTP代理服务...');
    
    // 清理所有等待中的任务
    this.cleanupPendingTasks('服务关闭');
    
    // 关闭WebSocket连接
    if (this.wsClient) {
      this.wsClient.close();
    }
    
    // 关闭HTTP服务器
    if (this.server) {
      this.server.close();
    }
    
    console.log('✅ HTTP代理服务已关闭');
  }
}

// 启动服务
async function startService() {
  const proxyService = new HttpProxyService();
  
  try {
    proxyService.start();
    
    // 优雅关闭处理
    process.on('SIGINT', async () => {
      console.log('\n🛑 接收到关闭信号...');
      await proxyService.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 接收到终止信号...');
      await proxyService.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('💥 服务启动失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startService();
}

module.exports = HttpProxyService;