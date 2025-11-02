const redis = require('redis');
const fs = require('fs').promises;
const path = require('path');

class ProxyIPManager {
  constructor(redisConfig = {}) {
    this.redisClient = redis.createClient(redisConfig);
    this.availableQueueKey = 'proxy:available';
    this.checkingQueueKey = 'proxy:checking';
    this.usingQueueKey = 'proxy:using';
    this.lockKeyPrefix = 'proxy:lock:';
    
    // 连接 Redis
    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
    });
    
    this.redisClient.connect();
  }

  /**
   * 安全获取代理（防止程序崩溃丢失）
   */
  async safeGetProxy(timeout = 300, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      autoRenew = true
    } = options;

    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 使用事务确保原子性
        const multi = this.redisClient.multi();
        multi.zRange(this.availableQueueKey, -1, -1, 'REV');
        
        const results = await multi.exec();
        const members = results[0];
        
        if (members.length === 0) {
          console.warn('没有可用的代理');
          return null;
        }

        const memberStr = members[0];
        const proxyData = JSON.parse(memberStr);
        const lockKey = this.lockKeyPrefix + proxyData.ip;
        
        // 检查是否已被锁定
        const isLocked = await this.redisClient.get(lockKey);
        if (isLocked) {
          console.warn(`代理 ${proxyData.ip} 已被锁定，重试中...`);
          retries++;
          await this.delay(retryDelay);
          continue;
        }

        // 获取分布式锁
        const lockAcquired = await this.acquireLock(lockKey, proxyData.ip, timeout);
        if (!lockAcquired) {
          console.warn(`获取代理 ${proxyData.ip} 锁失败，重试中...`);
          retries++;
          await this.delay(retryDelay);
          continue;
        }

        // 从可用队列移除并添加到使用中队列
        const transaction = this.redisClient.multi();
        transaction.zRem(this.availableQueueKey, memberStr);
        
        const usingData = {
          ...proxyData,
          status: 'using',
          borrowTime: Date.now(),
          timeout: timeout,
          expireAt: Date.now() + (timeout * 1000)
        };
        
        transaction.zAdd(this.usingQueueKey, [
          { score: usingData.expireAt, value: JSON.stringify(usingData) }
        ]);
        
        await transaction.exec();
        
        console.log(`成功获取代理 ${proxyData.ip}，锁定 ${timeout} 秒`);
        
        // 设置自动续期
        let renewTimer = null;
        if (autoRenew) {
          renewTimer = this.setupAutoRenew(lockKey, proxyData.ip, timeout);
        }
        
        return {
          ...proxyData,
          _lockKey: lockKey,
          _renewTimer: renewTimer,
          _release: () => this.releaseProxy(usingData, true),
          _markFailed: () => this.releaseProxy(usingData, false),
          _renew: (newTimeout) => this.renewProxyLock(usingData, newTimeout)
        };

      } catch (error) {
        console.error(`第 ${retries + 1} 次获取代理失败:`, error);
        retries++;
        if (retries < maxRetries) {
          await this.delay(retryDelay);
        }
      }
    }
    
    console.error(`获取代理失败，已重试 ${maxRetries} 次`);
    return null;
  }

  /**
   * 获取分布式锁
   */
  async acquireLock(lockKey, identifier, ttl) {
    try {
      const result = await this.redisClient.set(
        lockKey,
        identifier,
        {
          NX: true,
          EX: ttl
        }
      );
      
      return result === 'OK';
    } catch (error) {
      console.error('获取锁失败:', error);
      return false;
    }
  }

  /**
   * 释放锁
   */
  async releaseLock(lockKey, identifier) {
    try {
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.redisClient.eval(
        luaScript,
        {
          keys: [lockKey],
          arguments: [identifier]
        }
      );
      
      return result === 1;
    } catch (error) {
      console.error('释放锁失败:', error);
      return false;
    }
  }

  /**
   * 设置自动续期
   */
  setupAutoRenew(lockKey, identifier, ttl) {
    const renewInterval = Math.floor(ttl * 0.6) * 1000;
    
    const renewTimer = setInterval(async () => {
      try {
        const renewed = await this.redisClient.expire(lockKey, ttl);
        if (renewed) {
          console.log(`代理锁 ${lockKey} 已续期`);
        } else {
          console.warn(`代理锁 ${lockKey} 续期失败，可能已释放`);
          clearInterval(renewTimer);
        }
      } catch (error) {
        console.error('续期失败:', error);
        clearInterval(renewTimer);
      }
    }, renewInterval);

    return renewTimer;
  }

  /**
   * 续期代理锁
   */
  async renewProxyLock(proxyData, newTimeout) {
    const lockKey = this.lockKeyPrefix + proxyData.ip;
    
    try {
      // 更新锁的过期时间
      await this.redisClient.expire(lockKey, newTimeout);
      
      // 更新使用中队列的过期时间
      const newExpireAt = Date.now() + (newTimeout * 1000);
      const newMember = JSON.stringify({
        ...proxyData,
        timeout: newTimeout,
        expireAt: newExpireAt
      });
      
      const transaction = this.redisClient.multi();
      transaction.zRem(this.usingQueueKey, JSON.stringify(proxyData));
      transaction.zAdd(this.usingQueueKey, [
        { score: newExpireAt, value: newMember }
      ]);
      
      await transaction.exec();
      
      console.log(`代理 ${proxyData.ip} 锁已续期，新超时: ${newTimeout}秒`);
      return true;
    } catch (error) {
      console.error('续期代理锁失败:', error);
      return false;
    }
  }

  /**
   * 释放代理
   */
  async releaseProxy(proxyData, success = true, newScore = null) {
    const lockKey = this.lockKeyPrefix + proxyData.ip;
    
    try {
      const transaction = this.redisClient.multi();
      
      // 从使用中队列移除
      const usingMember = JSON.stringify(proxyData);
      transaction.zRem(this.usingQueueKey, usingMember);
      
      // 释放锁
      transaction.del(lockKey);
      
      // 清理续期定时器
      if (proxyData._renewTimer) {
        clearInterval(proxyData._renewTimer);
      }
      
      if (success) {
        // 成功使用，放回可用队列
        const score = newScore !== null ? newScore : (proxyData.score || 100) + 10;
        const availableData = {
          ...proxyData,
          status: 'available',
          lastUsedTime: Date.now(),
          successCount: (proxyData.successCount || 0) + 1,
          totalUsedTime: Date.now() - proxyData.borrowTime
        };
        delete availableData.borrowTime;
        delete availableData.timeout;
        delete availableData.expireAt;
        delete availableData._renewTimer;
        
        transaction.zAdd(this.availableQueueKey, [
          { score, value: JSON.stringify(availableData) }
        ]);
        
        console.log(`代理 ${proxyData.ip} 使用成功，放回可用队列，新分数: ${score}`);
      } else {
        // 使用失败，放到待检查队列
        const checkTime = Math.floor(Date.now() / 1000);
        const checkingData = {
          ...proxyData,
          status: 'checking',
          failCount: (proxyData.failCount || 0) + 1
        };
        delete checkingData.borrowTime;
        delete checkingData.timeout;
        delete checkingData.expireAt;
        delete checkingData._renewTimer;
        
        transaction.zAdd(this.checkingQueueKey, [
          { score: checkTime, value: JSON.stringify(checkingData) }
        ]);
        
        console.log(`代理 ${proxyData.ip} 使用失败，放到待检查队列`);
      }
      
      await transaction.exec();
      return true;
      
    } catch (error) {
      console.error('释放代理失败:', error);
      
      // 失败时尝试强制释放锁
      try {
        await this.releaseLock(lockKey, proxyData.ip);
      } catch (lockError) {
        console.error('强制释放锁失败:', lockError);
      }
      
      return false;
    }
  }

  /**
   * 恢复过期的使用中代理
   */
  async recoverExpiredProxies() {
    try {
      const now = Date.now();
      const expiredMembers = await this.redisClient.zRangeByScore(
        this.usingQueueKey,
        0,
        now
      );
      
      let recoveredCount = 0;
      
      for (const memberStr of expiredMembers) {
        try {
          const proxyData = JSON.parse(memberStr);
          console.warn(`发现过期代理: ${proxyData.ip}，过期时间: ${new Date(proxyData.expireAt)}`);
          
          // 强制释放并放回待检查队列
          await this.releaseProxy(proxyData, false);
          recoveredCount++;
          
        } catch (error) {
          console.error('恢复过期代理失败:', error);
        }
      }
      
      if (recoveredCount > 0) {
        console.log(`已恢复 ${recoveredCount} 个过期代理`);
      }
      
      return recoveredCount;
    } catch (error) {
      console.error('恢复过期代理过程失败:', error);
      return 0;
    }
  }

  /**
   * 从文本文件导入代理 IP
   */
  async importFromFile(filePath, options = {}) {
    const {
      queue = 'checking',
      format = 'plain',
      delimiter = '\n',
      defaultMetadata = {}
    } = options;

    try {
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch (error) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      if (!fileContent.trim()) {
        console.warn('文件内容为空');
        return { success: 0, failed: 0, total: 0 };
      }

      // 解析代理 IP
      const proxies = this.parseProxies(fileContent, format, delimiter);
      
      let successCount = 0;
      let failedCount = 0;

      // 批量导入
      for (const proxyData of proxies) {
        try {
          const result = await this.addProxyFromImport(proxyData, queue, defaultMetadata);
          if (result) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`导入代理失败 ${proxyData.ip}:`, error.message);
          failedCount++;
        }
      }

      console.log(`导入完成: 成功 ${successCount} 个, 失败 ${failedCount} 个, 总计 ${proxies.length} 个`);
      return {
        success: successCount,
        failed: failedCount,
        total: proxies.length
      };

    } catch (error) {
      console.error('导入文件失败:', error.message);
      return { success: 0, failed: 0, total: 0 };
    }
  }

  /**
   * 解析代理 IP 数据
   */
  parseProxies(content, format, delimiter) {
    const lines = content.split(delimiter).filter(line => line.trim());
    const proxies = [];

    for (const line of lines) {
      try {
        let proxyData;

        if (format === 'json') {
          proxyData = JSON.parse(line);
        } else {
          proxyData = this.parsePlainProxy(line);
        }

        if (proxyData && proxyData.ip) {
          proxies.push(proxyData);
        }
      } catch (error) {
        console.warn(`解析行失败: ${line}`, error.message);
      }
    }

    return proxies;
  }

  /**
   * 解析纯文本格式的代理 IP
   */
  parsePlainProxy(line) {
    line = line.trim();
    line = line.replace(/^['"]|['"]$/g, '');
    
    const patterns = [
      /^(https?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/,
      /^([^:]+):(\d+)$/,
      /^(https?):\/\/([^:]+):(\d+)$/,
      /^(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const proxyData = { ip: line };
        
        if (match[1] && (match[1] === 'http' || match[1] === 'https')) {
          proxyData.protocol = match[1];
          proxyData.host = match[2] || match[4];
          proxyData.port = parseInt(match[3] || match[5]);
          
          if (match[2] && match[3] && match[4]) {
            proxyData.username = match[2];
            proxyData.password = match[3];
            proxyData.host = match[4];
            proxyData.port = parseInt(match[5]);
          }
        } else if (match[1] && match[2]) {
          proxyData.host = match[1];
          proxyData.port = parseInt(match[2]);
          proxyData.protocol = 'http';
        }

        return proxyData;
      }
    }

    // 如果都不匹配，尝试按空格分隔
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      return {
        ip: parts[0],
        protocol: parts[1] || 'http',
        host: parts[0].split(':')[0],
        port: parseInt(parts[0].split(':')[1]) || 80
      };
    }

    return { ip: line };
  }

  /**
   * 添加从导入中解析的代理
   */
  async addProxyFromImport(proxyData, queue, defaultMetadata) {
    const metadata = {
      ...defaultMetadata,
      ...proxyData,
      importTime: Date.now()
    };

    const { ip, ...restMetadata } = metadata;

    if (queue === 'available') {
      const score = this.calculateInitialScore(proxyData);
      return await this.addToAvailableQueue(ip, score, restMetadata);
    } else {
      const checkTime = Math.floor(Date.now() / 1000);
      return await this.addToCheckingQueue(ip, checkTime, restMetadata);
    }
  }

  /**
   * 计算初始分数
   */
  calculateInitialScore(proxyData) {
    let score = 100;
    
    if (proxyData.protocol === 'https') {
      score += 20;
    }
    
    if (proxyData.username && proxyData.password) {
      score += 10;
    }
    
    const commonPorts = [80, 8080, 3128, 1080];
    if (commonPorts.includes(proxyData.port)) {
      score += 5;
    }
    
    return score;
  }

  /**
   * 从目录批量导入多个文件
   */
  async importFromDirectory(dirPath, options = {}) {
    const {
      filePattern = /\.(txt|json|csv)$/i,
      ...importOptions
    } = options;

    try {
      const files = await fs.readdir(dirPath);
      const results = [];

      for (const file of files) {
        if (filePattern.test(file)) {
          const filePath = path.join(dirPath, file);
          console.log(`导入文件: ${file}`);
          
          const result = await this.importFromFile(filePath, importOptions);
          results.push({
            file,
            ...result
          });
        }
      }

      console.log('批量导入完成:');
      results.forEach(result => {
        console.log(`  ${result.file}: 成功 ${result.success}, 失败 ${result.failed}`);
      });

      return results;

    } catch (error) {
      console.error('导入目录失败:', error.message);
      return [];
    }
  }

  /**
   * 导出代理 IP 到文件
   */
  async exportToFile(filePath, options = {}) {
    const {
      queue = 'available',
      format = 'plain',
      includeMetadata = false
    } = options;

    try {
      let proxies;
      if (queue === 'available') {
        proxies = await this.getAvailableProxies(10000);
      } else {
        proxies = await this.getCheckingProxies(10000);
      }

      let content = '';
      
      if (format === 'json') {
        const data = proxies.map(proxy => {
          if (includeMetadata) {
            return proxy;
          } else {
            return { ip: proxy.ip };
          }
        });
        content = JSON.stringify(data, null, 2);
      } else {
        content = proxies.map(proxy => proxy.ip).join('\n');
      }

      await fs.writeFile(filePath, content, 'utf8');
      console.log(`导出完成: ${proxies.length} 个代理已保存到 ${filePath}`);
      
      return proxies.length;

    } catch (error) {
      console.error('导出文件失败:', error.message);
      return 0;
    }
  }

  /**
   * 添加代理 IP 到待检查队列
   */
  async addToCheckingQueue(ip, checkTime = Math.floor(Date.now() / 1000), metadata = {}) {
    try {
      const member = JSON.stringify({
        ip,
        ...metadata,
        addTime: Date.now()
      });
      
      await this.redisClient.zAdd(this.checkingQueueKey, [
        { score: checkTime, value: member }
      ]);
      
      console.log(`代理IP ${ip} 已添加到待检查队列，检查时间: ${new Date(checkTime * 1000)}`);
      return true;
    } catch (error) {
      console.error('添加到待检查队列失败:', error);
      return false;
    }
  }

  /**
   * 添加代理 IP 到可用队列
   */
  async addToAvailableQueue(ip, score = 100, metadata = {}) {
    try {
      const member = JSON.stringify({
        ip,
        ...metadata,
        lastCheckTime: Date.now(),
        status: 'available'
      });
      
      await this.redisClient.zAdd(this.availableQueueKey, [
        { score, value: member }
      ]);
      
      console.log(`代理IP ${ip} 已添加到可用队列，分数: ${score}`);
      return true;
    } catch (error) {
      console.error('添加到可用队列失败:', error);
      return false;
    }
  }

  /**
   * 获取待检查的代理 IP
   */
  async getCheckingProxies(count = 10) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const members = await this.redisClient.zRangeByScore(
        this.checkingQueueKey,
        0,
        now,
        'LIMIT',
        0,
        count
      );
      
      const proxies = members.map(member => JSON.parse(member));
      return proxies;
    } catch (error) {
      console.error('获取待检查代理失败:', error);
      return [];
    }
  }

  /**
   * 获取可用的代理 IP
   */
  async getAvailableProxies(count = 10, highestFirst = true) {
    try {
      let members;
      if (highestFirst) {
        members = await this.redisClient.zRange(
          this.availableQueueKey,
          -count,
          -1,
          'REV'
        );
      } else {
        members = await this.redisClient.zRange(
          this.availableQueueKey,
          0,
          count - 1
        );
      }
      
      const proxies = members.map(member => JSON.parse(member));
      return proxies;
    } catch (error) {
      console.error('获取可用代理失败:', error);
      return [];
    }
  }

  /**
   * 获取最佳代理 IP
   */
  async getBestProxy() {
    try {
      const members = await this.redisClient.zRange(
        this.availableQueueKey,
        -1,
        -1,
        'REV'
      );
      
      if (members.length === 0) {
        return null;
      }
      
      return JSON.parse(members[0]);
    } catch (error) {
      console.error('获取最佳代理失败:', error);
      return null;
    }
  }

  /**
   * 从待检查队列移动到可用队列
   */
  async moveToAvailable(checkingMember, score = 100, metadata = {}) {
    try {
      const memberStr = typeof checkingMember === 'string' 
        ? checkingMember 
        : JSON.stringify(checkingMember);
      
      await this.redisClient.zRem(this.checkingQueueKey, memberStr);
      
      const originalData = typeof checkingMember === 'string' 
        ? JSON.parse(checkingMember) 
        : checkingMember;
      
      const newMember = JSON.stringify({
        ...originalData,
        ...metadata,
        lastCheckTime: Date.now(),
        status: 'available'
      });
      
      await this.redisClient.zAdd(this.availableQueueKey, [
        { score, value: newMember }
      ]);
      
      console.log(`代理IP ${originalData.ip} 已移动到可用队列`);
      return true;
    } catch (error) {
      console.error('移动到可用队列失败:', error);
      return false;
    }
  }

  /**
   * 从可用队列移动到待检查队列
   */
  async moveToChecking(availableMember, checkTime = Math.floor(Date.now() / 1000)) {
    try {
      const memberStr = typeof availableMember === 'string' 
        ? availableMember 
        : JSON.stringify(availableMember);
      
      await this.redisClient.zRem(this.availableQueueKey, memberStr);
      
      const originalData = typeof availableMember === 'string' 
        ? JSON.parse(availableMember) 
        : availableMember;
      
      const newMember = JSON.stringify({
        ...originalData,
        status: 'checking',
        nextCheckTime: checkTime
      });
      
      await this.redisClient.zAdd(this.checkingQueueKey, [
        { score: checkTime, value: newMember }
      ]);
      
      console.log(`代理IP ${originalData.ip} 已移动到待检查队列`);
      return true;
    } catch (error) {
      console.error('移动到待检查队列失败:', error);
      return false;
    }
  }

  /**
   * 从队列中删除代理 IP
   */
  async removeProxy(member, fromQueue = 'both') {
    try {
      const memberStr = typeof member === 'string' ? member : JSON.stringify(member);
      
      if (fromQueue === 'both' || fromQueue === 'available') {
        await this.redisClient.zRem(this.availableQueueKey, memberStr);
      }
      
      if (fromQueue === 'both' || fromQueue === 'checking') {
        await this.redisClient.zRem(this.checkingQueueKey, memberStr);
      }
      
      const ipData = typeof member === 'string' ? JSON.parse(member) : member;
      console.log(`代理IP ${ipData.ip} 已从队列中删除`);
      return true;
    } catch (error) {
      console.error('删除代理失败:', error);
      return false;
    }
  }

  /**
   * 更新代理 IP 分数
   */
  async updateProxyScore(member, newScore, queue = 'available') {
    try {
      const memberStr = typeof member === 'string' ? member : JSON.stringify(member);
      const queueKey = queue === 'available' ? this.availableQueueKey : this.checkingQueueKey;
      
      await this.redisClient.zAdd(queueKey, [
        { score: newScore, value: memberStr }
      ]);
      
      const ipData = typeof member === 'string' ? JSON.parse(member) : member;
      console.log(`代理IP ${ipData.ip} 分数已更新为: ${newScore}`);
      return true;
    } catch (error) {
      console.error('更新代理分数失败:', error);
      return false;
    }
  }

  /**
   * 获取代理使用状态
   */
  async getProxyStatus(ip) {
    try {
      const lockKey = this.lockKeyPrefix + ip;
      const lockInfo = await this.redisClient.get(lockKey);
      
      const usingMembers = await this.redisClient.zRangeByScore(
        this.usingQueueKey,
        '-inf',
        '+inf'
      );
      
      const usingProxy = usingMembers.find(member => {
        const data = JSON.parse(member);
        return data.ip === ip;
      });
      
      return {
        isLocked: !!lockInfo,
        lockKey,
        isUsing: !!usingProxy,
        usingInfo: usingProxy ? JSON.parse(usingProxy) : null
      };
    } catch (error) {
      console.error('获取代理状态失败:', error);
      return { isLocked: false, isUsing: false };
    }
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats() {
    try {
      const availableCount = await this.redisClient.zCard(this.availableQueueKey);
      const checkingCount = await this.redisClient.zCard(this.checkingQueueKey);
      const usingCount = await this.redisClient.zCard(this.usingQueueKey);
      
      const usingMembers = await this.redisClient.zRange(this.usingQueueKey, 0, -1);
      const usingProxies = usingMembers.map(member => JSON.parse(member));
      
      const expiredCount = usingProxies.filter(proxy => 
        proxy.expireAt && proxy.expireAt < Date.now()
      ).length;
      
      return {
        availableCount,
        checkingCount,
        usingCount,
        expiredCount,
        totalCount: availableCount + checkingCount + usingCount,
        usingProxies: usingProxies.map(proxy => ({
          ip: proxy.ip,
          borrowTime: new Date(proxy.borrowTime),
          expireAt: new Date(proxy.expireAt),
          timeout: proxy.timeout
        }))
      };
    } catch (error) {
      console.error('获取队列统计失败:', error);
      return { 
        availableCount: 0, 
        checkingCount: 0, 
        usingCount: 0, 
        expiredCount: 0,
        totalCount: 0,
        usingProxies: []
      };
    }
  }

  /**
   * 清理过期代理
   */
  async cleanupExpiredProxies(expireSeconds = 3600) {
    try {
      const expireTime = Math.floor(Date.now() / 1000) - expireSeconds;
      const removed = await this.redisClient.zRemRangeByScore(
        this.checkingQueueKey,
        0,
        expireTime
      );
      
      console.log(`已清理 ${removed} 个过期代理`);
      return removed;
    } catch (error) {
      console.error('清理过期代理失败:', error);
      return 0;
    }
  }

  /**
   * 批量恢复所有过期代理
   */
  async recoverAllExpiredProxies() {
    console.log('开始恢复所有过期代理...');
    const count = await this.recoverExpiredProxies();
    console.log(`恢复完成，共处理 ${count} 个过期代理`);
    return count;
  }

  /**
   * 设置定时恢复任务
   */
  startAutoRecovery(interval = 60000) {
    console.log(`启动自动恢复任务，间隔: ${interval}ms`);
    
    const timer = setInterval(async () => {
      try {
        await this.recoverExpiredProxies();
      } catch (error) {
        console.error('自动恢复任务失败:', error);
      }
    }, interval);
    
    return () => {
      clearInterval(timer);
      console.log('自动恢复任务已停止');
    };
  }

  /**
   * 工具函数：延迟
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 关闭 Redis 连接
   */
  async disconnect() {
    await this.redisClient.quit();
  }
}

module.exports = ProxyIPManager;