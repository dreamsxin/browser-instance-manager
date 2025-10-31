import { fileURLToPath } from 'url';
import { resolve, normalize } from 'path';

/**
 * 跨平台的主模块检测工具
 */

/**
 * 检测当前模块是否为主入口模块
 * @param {string} importMetaUrl import.meta.url
 * @returns {boolean}
 */
export function isMainModule(importMetaUrl) {
  try {
    const currentFilePath = fileURLToPath(importMetaUrl);
    const mainModulePath = getMainModulePath();
    
    // 标准化路径以处理不同操作系统的路径分隔符
    const normalizedCurrent = normalizePath(currentFilePath);
    const normalizedMain = normalizePath(mainModulePath);
    
    return normalizedCurrent === normalizedMain;
  } catch (error) {
    console.warn('Failed to detect main module:', error);
    return false;
  }
}

/**
 * 获取主模块路径（跨平台）
 * @returns {string}
 */
export function getMainModulePath() {
  // 处理不同情况下的主模块路径
  const mainModule = process.argv[1];
  
  if (!mainModule) {
    // 如果是通过 eval 或其他方式运行，返回当前工作目录
    return process.cwd();
  }
  
  // 解析为绝对路径
  return resolve(process.cwd(), mainModule);
}

/**
 * 标准化路径（处理跨平台路径分隔符）
 * @param {string} path 路径
 * @returns {string}
 */
export function normalizePath(path) {
  return normalize(path).replace(/\\/g, '/').toLowerCase();
}

/**
 * 获取当前文件路径（从 import.meta.url）
 * @param {string} importMetaUrl import.meta.url
 * @returns {string}
 */
export function getCurrentFilePath(importMetaUrl) {
  return fileURLToPath(importMetaUrl);
}

/**
 * 安全的主模块检测（带备选方案）
 * @param {string} importMetaUrl import.meta.url
 * @param {Object} options 选项
 * @returns {boolean}
 */
export function safeMainModuleCheck(importMetaUrl, options = {}) {
  const {
    fallbackToRequireMain = true,
    checkPackageJsonMain = true
  } = options;
  
  try {
    // 方法1：直接路径比较
    if (isMainModule(importMetaUrl)) {
      return true;
    }
    
    // 方法2：使用 require.main（CommonJS 回退）
    if (fallbackToRequireMain && typeof require !== 'undefined' && require.main) {
      const currentPath = getCurrentFilePath(importMetaUrl);
      const mainPath = require.main.filename;
      return normalizePath(currentPath) === normalizePath(mainPath);
    }
    
    // 方法3：检查 package.json 中的 main 字段
    if (checkPackageJsonMain) {
      return checkPackageJsonMainField(importMetaUrl);
    }
    
    return false;
  } catch (error) {
    console.warn('Main module check failed, using fallback:', error);
    
    // 最终备选：检查命令行参数
    return process.argv[1] && process.argv[1].includes('example') || false;
  }
}

/**
 * 检查 package.json 中的 main 字段
 * @param {string} importMetaUrl import.meta.url
 * @returns {boolean}
 */
function checkPackageJsonMainField(importMetaUrl) {
  try {
    const { readFileSync } = require('fs');
    const { resolve, dirname } = require('path');
    
    // 从当前文件向上查找 package.json
    let currentDir = dirname(getCurrentFilePath(importMetaUrl));
    const rootDir = resolve(process.cwd(), '..');
    
    while (currentDir !== rootDir) {
      try {
        const packageJsonPath = resolve(currentDir, 'package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        
        if (packageJson.main) {
          const mainPath = resolve(currentDir, packageJson.main);
          const currentPath = getCurrentFilePath(importMetaUrl);
          
          return normalizePath(mainPath) === normalizePath(currentPath);
        }
        
        // 移动到父目录
        currentDir = dirname(currentDir);
      } catch {
        // 继续向上查找
        currentDir = dirname(currentDir);
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * 平台检测
 */
export const platform = {
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  isMacOS: process.platform === 'darwin',
  isUnix: ['linux', 'darwin'].includes(process.platform)
};

export default {
  isMainModule,
  getMainModulePath,
  normalizePath,
  getCurrentFilePath,
  safeMainModuleCheck,
  platform
};