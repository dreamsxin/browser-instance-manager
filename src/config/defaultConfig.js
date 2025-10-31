import { MODES, BROWSER_TYPES, LOG_LEVELS } from '../utils/constants.js';

export const DEFAULT_CONFIG = {
  // 默认浏览器类型
  defaultBrowser: BROWSER_TYPES.CHROMIUM,
  
  // 默认启动模式
  defaultMode: MODES.LAUNCH,
  
  // 实例限制
  maxInstances: 10,
  
  // 超时设置
  timeout: 30000,
  navigationTimeout: 30000,
  waitTimeout: 10000,
  
  // 日志配置
  logLevel: LOG_LEVELS.INFO,
  logToFile: false,
  logFilePath: './logs/browser-manager.log',
  
  // 健康检查配置
  healthCheckInterval: 30000,
  healthCheckTimeout: 5000,
  
  // 重试配置
  maxRetries: 3,
  retryDelay: 1000,
  
  // 性能配置
  maxPagesPerBrowser: 10,
  memoryLimit: 1024, // MB
  
  // 安全配置
  blockThirdPartyCookies: true,
  blockImages: false,
  javaScriptEnabled: true,
  
  // 视图配置
  defaultViewport: {
    width: 1920,
    height: 1080
  },
  
  // 用户代理
  userAgent: null
};

export const LAUNCH_MODE_CONFIG = {
  headless: true,
  devtools: false,
  slowMo: 0,
  ignoreHTTPSErrors: false
};

export const LAUNCH_SERVER_MODE_CONFIG = {
  headless: true,
  port: 0, // 自动选择端口
  wsPath: '/ws'
};

export const BROWSER_SPECIFIC_CONFIG = {
  [BROWSER_TYPES.CHROMIUM]: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  },
  [BROWSER_TYPES.FIREFOX]: {
    args: [
      '-wait-for-browser',
      '-no-remote',
      '-new-instance'
    ],
    firefoxUserPrefs: {
      'dom.webnotifications.enabled': false,
      'media.volume_scale': '0.0'
    }
  },
  [BROWSER_TYPES.WEBKIT]: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  }
};

export default DEFAULT_CONFIG;