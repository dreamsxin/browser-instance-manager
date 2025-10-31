import { createLogger } from './logger.js';

const logger = createLogger();

/**
 * 延迟函数
 * @param {number} ms 延迟毫秒数
 * @returns {Promise}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成唯一ID
 * @param {string} prefix 前缀
 * @returns {string}
 */
export function generateId(prefix = 'instance') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * URL验证
 * @param {string} url URL地址
 * @returns {boolean}
 */
export function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清理选项对象，移除undefined值
 * @param {object} options 选项对象
 * @returns {object}
 */
export function sanitizeOptions(options) {
  const sanitized = { ...options };
  
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });
  
  return sanitized;
}

/**
 * 深度合并对象
 * @param {object} target 目标对象
 * @param {object} source 源对象
 * @returns {object}
 */
export function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

/**
 * 格式化字节大小
 * @param {number} bytes 字节数
 * @param {number} decimals 小数位数
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 格式化时间间隔
 * @param {number} ms 毫秒数
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 重试函数
 * @param {Function} fn 要重试的函数
 * @param {number} retries 重试次数
 * @param {number} delayMs 延迟毫秒数
 * @param {Function} shouldRetry 判断是否应该重试的函数
 * @returns {Promise}
 */
export function retry(fn, retries = 3, delayMs = 1000, shouldRetry = null) {
  return async (...args) => {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        // 检查是否应该重试
        if (shouldRetry && !shouldRetry(error)) {
          throw error;
        }
        
        logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < retries) {
          const currentDelay = delayMs * Math.pow(2, attempt - 1); // 指数退避
          logger.info(`Retrying in ${currentDelay}ms...`);
          await delay(currentDelay);
        }
      }
    }
    
    throw lastError;
  };
}

/**
 * 带超时的Promise
 * @param {Promise} promise 原始Promise
 * @param {number} timeoutMs 超时毫秒数
 * @param {string} timeoutMessage 超时消息
 * @returns {Promise}
 */
export function promiseWithTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  let timeoutId;
  
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 检查是否为对象
 * @param {*} value 要检查的值
 * @returns {boolean}
 */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 深度克隆对象
 * @param {*} obj 要克隆的对象
 * @returns {*}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * 生成性能报告
 * @param {Array} measurements 测量数据数组
 * @returns {object}
 */
export function generatePerformanceReport(measurements) {
  if (measurements.length === 0) {
    return {
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      p95: 0,
      p99: 0
    };
  }
  
  const sorted = [...measurements].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const average = sum / sorted.length;
  
  return {
    count: sorted.length,
    average,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

/**
 * 内存使用检查
 * @returns {object}
 */
export function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external)
    };
  }
  
  return {
    rss: 'N/A',
    heapTotal: 'N/A',
    heapUsed: 'N/A',
    external: 'N/A'
  };
}

export default {
  delay,
  generateId,
  validateUrl,
  sanitizeOptions,
  deepMerge,
  formatBytes,
  formatDuration,
  retry,
  promiseWithTimeout,
  isObject,
  deepClone,
  generatePerformanceReport,
  getMemoryUsage
};