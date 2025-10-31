import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

export class Logger {
  constructor(options = {}) {
    this.level = options.level || LOG_LEVELS.DEBUG;
    this.logToFile = options.logToFile || false;
    this.logFilePath = options.logFilePath || './logs/browser-manager.log';
    this.stream = null;
    this.name = options.name || 'BrowserManager';

    if (this.logToFile) {
      this.setupFileLogging();
    }
  }

  setupFileLogging() {
    const logDir = dirname(this.logFilePath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.stream = createWriteStream(this.logFilePath, { flags: 'a' });
  }

  shouldLog(level) {
    return level <= this.level;
  }

  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`;
        }
        return JSON.stringify(arg, this.getCircularReplacer(), 2);
      }
      return arg;
    });

    const logMessage = `[${timestamp}] [${levelName}] [${this.name}] ${message} ${formattedArgs.join(' ')}`;

    // 控制台输出
    if (level === LOG_LEVELS.ERROR) {
      console.error(logMessage);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }

    // 文件输出
    if (this.stream) {
      this.stream.write(logMessage + '\n');
    }
  }

  getCircularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  error(message, ...args) {
    this.log(LOG_LEVELS.ERROR, message, ...args);
  }

  warn(message, ...args) {
    this.log(LOG_LEVELS.WARN, message, ...args);
  }

  info(message, ...args) {
    this.log(LOG_LEVELS.INFO, message, ...args);
  }

  debug(message, ...args) {
    this.log(LOG_LEVELS.DEBUG, message, ...args);
  }

  // 性能日志
  time(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.time(`[${this.name}] ${label}`);
    }
  }

  timeEnd(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.timeEnd(`[${this.name}] ${label}`);
    }
  }

  // 创建子日志记录器
  child(name) {
    return new Logger({
      level: this.level,
      logToFile: this.logToFile,
      logFilePath: this.logFilePath,
      name: `${this.name}:${name}`
    });
  }

  close() {
    if (this.stream) {
      this.stream.end();
    }
  }
}

// 创建默认日志记录器
let defaultLogger = null;

export function createLogger(options = {}) {
  if (!defaultLogger) {
    defaultLogger = new Logger(options);
  }
  return defaultLogger;
}

// 创建特定模块的日志记录器
export function createModuleLogger(moduleName, options = {}) {
  return new Logger({
    ...options,
    name: moduleName
  });
}

export default Logger;