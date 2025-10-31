import BrowserManager from './core/BrowserManager.js';
import { LaunchMode, LaunchServerMode } from './modes/index.js';
import { BrowserType } from './browsers/BrowserFactory.js';
import { 
  BrowserInstanceError, 
  ConnectionError, 
  TimeoutError 
} from './utils/errors.js';
import { 
  createLogger, 
  metricsCollector 
} from './utils/index.js';

// 导出主要类
export { 
  BrowserManager, 
  LaunchMode, 
  LaunchServerMode, 
  BrowserType 
};

// 导出工具函数和错误类型
export {
  BrowserInstanceError,
  ConnectionError,
  TimeoutError,
  createLogger,
  metricsCollector
};

// 默认导出 BrowserManager
export default BrowserManager;