const redis = require('redis');

class RedisSortedSet {
  /**
   * 构造函数
   * @param {Object} options - Redis连接选项
   */
  constructor(options = {}) {
    this.options = {
      url: options.url || undefined,
      password: options.password || undefined,
      database: options.database || undefined,
      ...options
    };
    
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 连接到Redis
   */
  async connect() {
    try {
      console.log('Connecting to Redis:', this.options);
      this.client = redis.createClient({url: this.options.url, password: this.options.password, database: this.options.database});
      
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });
      
      this.client.on('connect', () => {
        console.log('Redis Client Connected');
      });
      
      await this.client.connect();
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * 断开Redis连接
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis Client Disconnected');
    }
  }

  /**
   * 检查连接状态
   */
  async checkConnection() {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      this.isConnected = false;
      console.error('Redis connection is not healthy:', error);
      throw new Error('Redis connection is not healthy');
    }
  }

  /**
   * 向有序集合添加成员
   * @param {string} key - 集合键名
   * @param {number} score - 分数
   */
  async incr(key, member) {
    await this.checkConnection();
    return await this.client.zIncrBy(key, 1, member);
  }

  /**
   * 向有序集合添加成员
   * @param {string} key - 集合键名
   * @param {number} score - 分数
   * @param {string} member - 成员
   */
  async zadd(key, score, member) {
    await this.checkConnection();
    return await this.client.zAdd(key, { score, value: member });
  }

  /**
   * 批量添加成员到有序集合
   * @param {string} key - 集合键名
   * @param {Array} members - 成员数组，格式为 [{score: number, value: string}]
   */
  async addMultiple(key, members) {
    await this.checkConnection();
    return await this.client.zAdd(key, members);
  }

  /**
   * 获取成员的分数
   * @param {string} key - 集合键名
   * @param {string} member - 成员
   */
  async getScore(key, member) {
    await this.checkConnection();
    return await this.client.zScore(key, member);
  }

  /**
   * 获取成员的排名（升序，从0开始）
   * @param {string} key - 集合键名
   * @param {string} member - 成员
   */
  async getRank(key, member) {
    await this.checkConnection();
    return await this.client.zRank(key, member);
  }

  /**
   * 获取成员的排名（降序，从0开始）
   * @param {string} key - 集合键名
   * @param {string} member - 成员
   */
  async getRevRank(key, member) {
    await this.checkConnection();
    return await this.client.zRevRank(key, member);
  }

  /**
   * 按分数范围获取成员（升序）
   * @param {string} key - 集合键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   * @param {Object} options - 选项
   */
  async getRangeByScore(key, min, max, options = {}) {
    await this.checkConnection();
    return await this.client.zRangeByScore(key, min, max, options);
  }

  /**
   * 按排名范围获取成员（升序）
   * @param {string} key - 集合键名
   * @param {number} start - 开始排名
   * @param {number} stop - 结束排名
   * @param {Object} options - 选项
   */
  async getRange(key, start, stop, options = {}) {
    await this.checkConnection();
    return await this.client.zRange(key, start, stop, options);
  }

  /**
   * 按排名范围获取成员（降序）
   * @param {string} key - 集合键名
   * @param {number} start - 开始排名
   * @param {number} stop - 结束排名
   * @param {Object} options - 选项
   */
  async getRevRange(key, start, stop, options = {}) {
    await this.checkConnection();
    return await this.client.zRevRange(key, start, stop, options);
  }

  /**
   * 按分数范围获取成员数量
   * @param {string} key - 集合键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   */
  async count(key, min, max) {
    await this.checkConnection();
    return await this.client.zCount(key, min, max);
  }

  /**
   * 获取有序集合的成员总数
   * @param {string} key - 集合键名
   */
  async card(key) {
    await this.checkConnection();
    return await this.client.zCard(key);
  }

  /**
   * 增加成员的分数
   * @param {string} key - 集合键名
   * @param {number} increment - 增量
   * @param {string} member - 成员
   */
  async incrementScore(key, increment, member) {
    await this.checkConnection();
    return await this.client.zIncrBy(key, increment, member);
  }

  /**
   * 移除成员
   * @param {string} key - 集合键名
   * @param {string|Array} members - 成员或成员数组
   */
  async remove(key, members) {
    await this.checkConnection();
    const memberArray = Array.isArray(members) ? members : [members];
    return await this.client.zRem(key, memberArray);
  }

  /**
   * 按排名范围移除成员
   * @param {string} key - 集合键名
   * @param {number} start - 开始排名
   * @param {number} stop - 结束排名
   */
  async removeRangeByRank(key, start, stop) {
    await this.checkConnection();
    return await this.client.zRemRangeByRank(key, start, stop);
  }

  /**
   * 按分数范围移除成员
   * @param {string} key - 集合键名
   * @param {number} min - 最小分数
   * @param {number} max - 最大分数
   */
  async removeRangeByScore(key, min, max) {
    await this.checkConnection();
    return await this.client.zRemRangeByScore(key, min, max);
  }

  /**
   * 获取所有成员（带分数）
   * @param {string} key - 集合键名
   */
  async getAllWithScores(key) {
    await this.checkConnection();
    return await this.client.zRangeWithScores(key, 0, -1);
  }

  /**
   * 取出分数最低的成员，并将其分数加1
   * @param {string} key - 集合键名
   * @param {number} increment - 增量，默认为1
   * @returns {Object|null} 返回成员信息 {member: string, oldScore: number, newScore: number} 或 null（如果没有成员）
   */
  async popMinAndIncrement(key, increment = 1) {
    await this.checkConnection();
    
    // 使用 Lua 脚本保证原子性操作
    const luaScript = `
      local key = KEYS[1]
      local increment = tonumber(ARGV[1])
      
      -- 获取分数最低的成员
      local members = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      
      if #members == 0 then
        return nil
      end
      
      local member = members[1]
      local oldScore = tonumber(members[2])
      local newScore = oldScore + increment
      
      -- 更新成员分数
      redis.call('ZADD', key, newScore, member)
      
      -- 返回成员信息
      return {member, oldScore, newScore}
    `;
    
    try {
      const result = await this.client.eval(luaScript, {
        keys: [key],
        arguments: [increment.toString()]
      });
      
      if (!result) {
        return null;
      }
      
      return {
        member: result[0],
        oldScore: parseFloat(result[1]),
        newScore: parseFloat(result[2])
      };
    } catch (error) {
      console.error('Lua script execution failed:', error);
      throw error;
    }
  }

  /**
   * 取出分数最低的成员（不删除）
   * @param {string} key - 集合键名
   * @returns {Object|null} 返回成员信息 {member: string, score: number} 或 null
   */
  async getMinMember(key) {
    await this.checkConnection();
    const members = await this.client.zRangeWithScores(key, 0, 0);
    
    if (members.length === 0) {
      return null;
    }
    
    return {
      member: members[0].value,
      score: members[0].score
    };
  }

  /**
   * 取出分数最高的成员，并将其分数减1
   * @param {string} key - 集合键名
   * @param {number} decrement - 减量，默认为1
   * @returns {Object|null} 返回成员信息 {member: string, oldScore: number, newScore: number} 或 null
   */
  async popMaxAndDecrement(key, decrement = 1) {
    await this.checkConnection();
    
    const luaScript = `
      local key = KEYS[1]
      local decrement = tonumber(ARGV[1])
      
      -- 获取分数最高的成员
      local members = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
      
      if #members == 0 then
        return nil
      end
      
      local member = members[1]
      local oldScore = tonumber(members[2])
      local newScore = oldScore - decrement
      
      -- 更新成员分数
      redis.call('ZADD', key, newScore, member)
      
      -- 返回成员信息
      return {member, oldScore, newScore}
    `;
    
    try {
      const result = await this.client.eval(luaScript, {
        keys: [key],
        arguments: [decrement.toString()]
      });
      
      if (!result) {
        return null;
      }
      
      return {
        member: result[0],
        oldScore: parseFloat(result[1]),
        newScore: parseFloat(result[2])
      };
    } catch (error) {
      console.error('Lua script execution failed:', error);
      throw error;
    }
  }
}

module.exports = RedisSortedSet;