export class BrowserInstanceError extends Error {
  constructor(message, code = 'BROWSER_INSTANCE_ERROR', details = null) {
    super(message);
    this.name = 'BrowserInstanceError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export class ConnectionError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ResourceExhaustedError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'RESOURCE_EXHAUSTED', details);
    this.name = 'ResourceExhaustedError';
  }
}

export class LaunchError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'LAUNCH_ERROR', details);
    this.name = 'LaunchError';
  }
}

export class HealthCheckError extends BrowserInstanceError {
  constructor(message, details = null) {
    super(message, 'HEALTH_CHECK_ERROR', details);
    this.name = 'HealthCheckError';
  }
}

// 错误代码常量
export const ERROR_CODES = {
  BROWSER_INSTANCE_ERROR: 'BROWSER_INSTANCE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  LAUNCH_ERROR: 'LAUNCH_ERROR',
  HEALTH_CHECK_ERROR: 'HEALTH_CHECK_ERROR'
};

// 错误工厂函数
export function createError(type, message, details = null) {
  const errorClasses = {
    [ERROR_CODES.BROWSER_INSTANCE_ERROR]: BrowserInstanceError,
    [ERROR_CODES.CONNECTION_ERROR]: ConnectionError,
    [ERROR_CODES.TIMEOUT_ERROR]: TimeoutError,
    [ERROR_CODES.VALIDATION_ERROR]: ValidationError,
    [ERROR_CODES.RESOURCE_EXHAUSTED]: ResourceExhaustedError,
    [ERROR_CODES.LAUNCH_ERROR]: LaunchError,
    [ERROR_CODES.HEALTH_CHECK_ERROR]: HealthCheckError
  };

  const ErrorClass = errorClasses[type] || BrowserInstanceError;
  return new ErrorClass(message, details);
}

// 错误包装器
export function wrapError(error, customMessage = null, errorType = null) {
  if (error instanceof BrowserInstanceError) {
    return error;
  }

  let message = customMessage || error.message;
  let type = errorType;

  if (!type) {
    // 根据错误消息自动判断类型
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('timeout')) {
      type = ERROR_CODES.TIMEOUT_ERROR;
    } else if (errorMessage.includes('connect') || errorMessage.includes('socket')) {
      type = ERROR_CODES.CONNECTION_ERROR;
    } else if (errorMessage.includes('launch')) {
      type = ERROR_CODES.LAUNCH_ERROR;
    } else if (errorMessage.includes('memory') || errorMessage.includes('resource')) {
      type = ERROR_CODES.RESOURCE_EXHAUSTED;
    } else {
      type = ERROR_CODES.BROWSER_INSTANCE_ERROR;
    }
  }

  return createError(type, message, {
    originalError: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  });
}

// 错误处理工具
export function isRetryableError(error) {
  const retryableCodes = [
    ERROR_CODES.CONNECTION_ERROR,
    ERROR_CODES.TIMEOUT_ERROR,
    ERROR_CODES.HEALTH_CHECK_ERROR
  ];

  return retryableCodes.includes(error.code);
}

export function getErrorContext(error) {
  return {
    name: error.name,
    code: error.code,
    message: error.message,
    timestamp: error.timestamp,
    details: error.details
  };
}

export default {
  BrowserInstanceError,
  ConnectionError,
  TimeoutError,
  ValidationError,
  ResourceExhaustedError,
  LaunchError,
  HealthCheckError,
  ERROR_CODES,
  createError,
  wrapError,
  isRetryableError,
  getErrorContext
};