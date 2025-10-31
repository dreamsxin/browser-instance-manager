// 启动模式常量
export const MODES = {
  LAUNCH: 'launch',
  LAUNCH_SERVER: 'launchServer'
};

// 浏览器类型常量
export const BROWSER_TYPES = {
  CHROMIUM: 'chromium',
  FIREFOX: 'firefox',
  WEBKIT: 'webkit'
};

// 日志级别常量
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// 实例状态常量
export const INSTANCE_STATUS = {
  CREATING: 'creating',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
  RECOVERING: 'recovering'
};

// 健康状态常量
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
  RECOVERING: 'recovering'
};

// 默认浏览器选项
export const DEFAULT_BROWSER_OPTIONS = {
  [BROWSER_TYPES.CHROMIUM]: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    ignoreDefaultArgs: ['--disable-extensions']
  },
  [BROWSER_TYPES.FIREFOX]: {
    headless: true,
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
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  }
};

// 性能常量
export const PERFORMANCE = {
  MAX_INSTANCES: 10,
  MAX_PAGES_PER_BROWSER: 20,
  HEALTH_CHECK_INTERVAL: 30000,
  DEFAULT_TIMEOUT: 30000,
  NAVIGATION_TIMEOUT: 30000,
  WAIT_TIMEOUT: 10000,
  LAUNCH_TIMEOUT: 60000,
  CONNECTION_TIMEOUT: 10000
};

// 重试常量
export const RETRY = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_RETRY_DELAY: 10000
};

// 事件常量
export const EVENTS = {
  INSTANCE_CREATED: 'instanceCreated',
  INSTANCE_STOPPED: 'instanceStopped',
  INSTANCE_ERROR: 'instanceError',
  INSTANCE_DISCONNECTED: 'instanceDisconnected',
  INSTANCE_RECOVERED: 'instanceRecovered',
  INSTANCE_UNHEALTHY: 'instanceUnhealthy',
  POOL_FULL: 'poolFull',
  MANAGER_SHUTDOWN: 'managerShutdown',
  HEALTH_CHECK_STARTED: 'healthCheckStarted',
  HEALTH_CHECK_COMPLETED: 'healthCheckCompleted'
};

// 配置常量
export const CONFIG = {
  DEFAULT_LOG_LEVEL: LOG_LEVELS.INFO,
  DEFAULT_BROWSER: BROWSER_TYPES.CHROMIUM,
  DEFAULT_MODE: MODES.LAUNCH,
  DEFAULT_VIEWPORT: { width: 1920, height: 1080 },
  MEMORY_LIMIT: 1024, // MB
  CPU_LIMIT: 1 // 核心数
};

// 验证常量
export const VALIDATION = {
  MAX_INSTANCE_ID_LENGTH: 50,
  INSTANCE_ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  MIN_VIEWPORT_WIDTH: 100,
  MAX_VIEWPORT_WIDTH: 4096,
  MIN_VIEWPORT_HEIGHT: 100,
  MAX_VIEWPORT_HEIGHT: 4096
};

export default {
  MODES,
  BROWSER_TYPES,
  LOG_LEVELS,
  INSTANCE_STATUS,
  HEALTH_STATUS,
  DEFAULT_BROWSER_OPTIONS,
  PERFORMANCE,
  RETRY,
  EVENTS,
  CONFIG,
  VALIDATION
};