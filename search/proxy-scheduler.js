class ProxyScheduler {
  constructor(proxyManager, checkInterval = 60000) {
    this.proxyManager = proxyManager;
    this.checkInterval = checkInterval;
    this.isRunning = false;
    this.timer = null;
  }

  start() {
    this.isRunning = true;
    this.runCheck();
    console.log('代理检查调度器已启动');
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    console.log('代理检查调度器已停止');
  }

  async runCheck() {
    if (!this.isRunning) return;

    try {
      console.log('开始检查代理...');
      
      // 获取待检查的代理
      const checkingProxies = await this.proxyManager.getCheckingProxies(20);
      
      for (const proxy of checkingProxies) {
        try {
          const isValid = await this.checkProxyValidity(proxy.ip);
          
          if (isValid) {
            // 更新分数并移动到可用队列
            const score = await this.calculateProxyScore(proxy);
            await this.proxyManager.moveToAvailable(proxy, score, {
              lastSuccessCheck: Date.now(),
              successCount: (proxy.successCount || 0) + 1
            });
          } else {
            // 检查失败，删除代理
            await this.proxyManager.removeProxy(proxy, 'checking');
          }
        } catch (error) {
          console.error(`检查代理 ${proxy.ip} 失败:`, error);
          await this.proxyManager.removeProxy(proxy, 'checking');
        }
      }

      // 定期清理过期代理
      await this.proxyManager.cleanupExpiredProxies(24 * 3600);

      console.log('代理检查完成');
    } catch (error) {
      console.error('代理检查过程出错:', error);
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(() => this.runCheck(), this.checkInterval);
      }
    }
  }

  async checkProxyValidity(ip) {
    // 这里实现实际的代理检查逻辑
    // 可以发送测试请求到目标网站验证代理是否可用
    
    // 模拟检查
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(Math.random() > 0.3);
      }, 1000);
    });
  }

  async calculateProxyScore(proxy) {
    let score = 100;
    
    if (proxy.anonymity === 'elite') score += 50;
    else if (proxy.anonymity === 'anonymous') score += 30;
    
    if (proxy.protocol === 'https') score += 30;
    
    if (proxy.responseTime) {
      if (proxy.responseTime < 100) score += 50;
      else if (proxy.responseTime < 500) score += 30;
      else if (proxy.responseTime < 1000) score += 10;
    }
    
    return score;
  }
}

module.exports = ProxyScheduler;