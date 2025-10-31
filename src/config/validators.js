import { MODES, BROWSER_TYPES, LOG_LEVELS } from '../utils/constants.js';
import { ValidationError } from '../utils/errors.js';

export class ConfigValidator {
  static validateConfig(config) {
    const errors = [];

    // 验证浏览器类型
    if (!Object.values(BROWSER_TYPES).includes(config.defaultBrowser)) {
      errors.push(`Invalid default browser: ${config.defaultBrowser}`);
    }

    // 验证启动模式
    if (!Object.values(MODES).includes(config.defaultMode)) {
      errors.push(`Invalid default mode: ${config.defaultMode}`);
    }

    // 验证实例限制
    if (typeof config.maxInstances !== 'number' || config.maxInstances < 1) {
      errors.push('maxInstances must be a positive number');
    }

    // 验证超时设置
    if (typeof config.timeout !== 'number' || config.timeout < 0) {
      errors.push('timeout must be a non-negative number');
    }

    // 验证日志级别
    if (!Object.values(LOG_LEVELS).includes(config.logLevel)) {
      errors.push(`Invalid log level: ${config.logLevel}`);
    }

    if (errors.length > 0) {
      throw new ValidationError(`Configuration validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  static validateLaunchOptions(options) {
    const errors = [];

    if (options.headless !== undefined && typeof options.headless !== 'boolean') {
      errors.push('headless must be a boolean');
    }

    if (options.timeout !== undefined && (typeof options.timeout !== 'number' || options.timeout < 0)) {
      errors.push('timeout must be a non-negative number');
    }

    if (options.args !== undefined && (!Array.isArray(options.args) || !options.args.every(arg => typeof arg === 'string'))) {
      errors.push('args must be an array of strings');
    }

    if (options.viewport !== undefined) {
      const viewportErrors = this.validateViewport(options.viewport);
      if (viewportErrors.length > 0) {
        errors.push(...viewportErrors);
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`Launch options validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  static validateViewport(viewport) {
    const errors = [];

    if (typeof viewport !== 'object' || viewport === null) {
      return ['viewport must be an object'];
    }

    if (typeof viewport.width !== 'number' || viewport.width < 1) {
      errors.push('viewport.width must be a positive number');
    }

    if (typeof viewport.height !== 'number' || viewport.height < 1) {
      errors.push('viewport.height must be a positive number');
    }

    if (viewport.deviceScaleFactor !== undefined && (typeof viewport.deviceScaleFactor !== 'number' || viewport.deviceScaleFactor < 1)) {
      errors.push('viewport.deviceScaleFactor must be a number >= 1');
    }

    return errors;
  }

  static validateInstanceId(instanceId) {
    if (typeof instanceId !== 'string' || instanceId.trim().length === 0) {
      throw new ValidationError('Instance ID must be a non-empty string');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(instanceId)) {
      throw new ValidationError('Instance ID can only contain letters, numbers, underscores and hyphens');
    }

    if (instanceId.length > 50) {
      throw new ValidationError('Instance ID must be 50 characters or less');
    }

    return true;
  }

  static validateBrowserType(browserType) {
    if (!Object.values(BROWSER_TYPES).includes(browserType)) {
      throw new ValidationError(`Invalid browser type: ${browserType}. Supported: ${Object.values(BROWSER_TYPES).join(', ')}`);
    }
    return true;
  }

  static validateMode(mode) {
    if (!Object.values(MODES).includes(mode)) {
      throw new ValidationError(`Invalid mode: ${mode}. Supported: ${Object.values(MODES).join(', ')}`);
    }
    return true;
  }

  static validateContextOptions(options) {
    const errors = [];

    if (options.viewport !== undefined) {
      const viewportErrors = this.validateViewport(options.viewport);
      if (viewportErrors.length > 0) {
        errors.push(...viewportErrors);
      }
    }

    if (options.userAgent !== undefined && typeof options.userAgent !== 'string') {
      errors.push('userAgent must be a string');
    }

    if (options.ignoreHTTPSErrors !== undefined && typeof options.ignoreHTTPSErrors !== 'boolean') {
      errors.push('ignoreHTTPSErrors must be a boolean');
    }

    if (options.javaScriptEnabled !== undefined && typeof options.javaScriptEnabled !== 'boolean') {
      errors.push('javaScriptEnabled must be a boolean');
    }

    if (options.blockImages !== undefined && typeof options.blockImages !== 'boolean') {
      errors.push('blockImages must be a boolean');
    }

    if (errors.length > 0) {
      throw new ValidationError(`Context options validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  static sanitizeConfig(config) {
    const sanitized = { ...config };

    // 确保数值在合理范围内
    if (sanitized.maxInstances < 1) sanitized.maxInstances = 1;
    if (sanitized.maxInstances > 100) sanitized.maxInstances = 100;

    if (sanitized.timeout < 1000) sanitized.timeout = 1000;
    if (sanitized.timeout > 300000) sanitized.timeout = 300000;

    if (sanitized.navigationTimeout < 1000) sanitized.navigationTimeout = 1000;
    if (sanitized.navigationTimeout > 300000) sanitized.navigationTimeout = 300000;

    if (sanitized.waitTimeout < 100) sanitized.waitTimeout = 100;
    if (sanitized.waitTimeout > 60000) sanitized.waitTimeout = 60000;

    // 确保视图端口在合理范围内
    if (sanitized.defaultViewport) {
      if (sanitized.defaultViewport.width < 100) sanitized.defaultViewport.width = 100;
      if (sanitized.defaultViewport.width > 4096) sanitized.defaultViewport.width = 4096;
      
      if (sanitized.defaultViewport.height < 100) sanitized.defaultViewport.height = 100;
      if (sanitized.defaultViewport.height > 4096) sanitized.defaultViewport.height = 4096;
    }

    return sanitized;
  }
}

export default ConfigValidator;