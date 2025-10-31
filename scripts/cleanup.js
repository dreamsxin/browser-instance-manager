#!/usr/bin/env node

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * 清理脚本 - 清理临时文件、日志和缓存
 */
class CleanupScript {
  constructor() {
    this.directoriesToClean = [
      'logs',
      'coverage',
      'tmp',
      'temp',
      'node_modules/.cache'
    ];
    
    this.patternsToDelete = [
      '*.log',
      '*.tmp',
      '*.temp',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*'
    ];
  }

  /**
   * 删除文件
   */
  deleteFile(filePath) {
    try {
      unlinkSync(filePath);
      console.log(`🗑️  删除文件: ${filePath}`);
      return true;
    } catch (error) {
      console.warn(`⚠️  无法删除文件 ${filePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * 删除目录
   */
  deleteDirectory(dirPath) {
    try {
      if (!existsSync(dirPath)) {
        return true;
      }

      const files = readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stat = statSync(filePath);
        
        if (stat.isDirectory()) {
          this.deleteDirectory(filePath);
        } else {
          this.deleteFile(filePath);
        }
      }
      
      rmdirSync(dirPath);
      console.log(`🗑️  删除目录: ${dirPath}`);
      return true;
    } catch (error) {
      console.warn(`⚠️  无法删除目录 ${dirPath}: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理目录中的文件
   */
  cleanDirectory(dirPath, patterns = []) {
    if (!existsSync(dirPath)) {
      return;
    }

    try {
      const files = readdirSync(dirPath);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = join(dirPath, file);
        
        // 检查是否匹配删除模式
        const shouldDelete = patterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(file);
          }
          return file === pattern;
        });

        if (shouldDelete) {
          if (this.deleteFile(filePath)) {
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`✅ 清理目录 ${dirPath}: 删除了 ${cleanedCount} 个文件`);
      }
    } catch (error) {
      console.warn(`⚠️  无法清理目录 ${dirPath}: ${error.message}`);
    }
  }

  /**
   * 清理日志文件
   */
  cleanLogs() {
    console.log('\n📋 清理日志文件...');
    
    this.directoriesToClean.forEach(dir => {
      if (existsSync(dir)) {
        this.cleanDirectory(dir, this.patternsToDelete);
      }
    });

    // 清理根目录的日志文件
    this.patternsToDelete.forEach(pattern => {
      const files = readdirSync('.').filter(file => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(file);
      });
      
      files.forEach(file => {
        this.deleteFile(file);
      });
    });
  }

  /**
   * 清理测试覆盖报告
   */
  cleanCoverage() {
    console.log('\n📋 清理测试覆盖报告...');
    
    if (existsSync('coverage')) {
      this.deleteDirectory('coverage');
    }
  }

  /**
   * 清理 Playwright 缓存
   */
  cleanPlaywrightCache() {
    console.log('\n📋 清理 Playwright 缓存...');
    
    try {
      // 尝试使用 Playwright 命令清理缓存
      execSync('npx playwright install --dry-run', { stdio: 'inherit' });
      console.log('✅ Playwright 缓存检查完成');
    } catch (error) {
      console.warn('⚠️  Playwright 缓存清理失败:', error.message);
    }
  }

  /**
   * 清理 Node.js 缓存
   */
  cleanNodeCache() {
    console.log('\n📋 清理 Node.js 缓存...');
    
    try {
      execSync('npm cache verify', { stdio: 'inherit' });
      console.log('✅ Node.js 缓存清理完成');
    } catch (error) {
      console.warn('⚠️  Node.js 缓存清理失败:', error.message);
    }
  }

  /**
   * 清理依赖缓存
   */
  cleanDependencyCache() {
    console.log('\n📋 清理依赖缓存...');
    
    const cacheDirs = [
      'node_modules/.cache',
      '.eslintcache'
    ];

    cacheDirs.forEach(dir => {
      if (existsSync(dir)) {
        this.deleteDirectory(dir);
      }
    });
  }

  /**
   * 显示磁盘使用情况
   */
  showDiskUsage() {
    console.log('\n💾 磁盘使用情况:');
    
    try {
      const result = execSync('du -sh ./* | sort -hr', { encoding: 'utf8' });
      console.log(result);
    } catch (error) {
      // 在 Windows 上可能不支持 du 命令
      console.log('ℹ️  磁盘使用信息不可用');
    }
  }

  /**
   * 运行所有清理任务
   */
  async runAll() {
    console.log('🚀 开始清理任务...\n');
    
    this.cleanLogs();
    this.cleanCoverage();
    this.cleanPlaywrightCache();
    this.cleanNodeCache();
    this.cleanDependencyCache();
    
    console.log('\n✅ 所有清理任务完成');
    
    this.showDiskUsage();
  }

  /**
   * 安全清理（不删除重要文件）
   */
  async runSafeCleanup() {
    console.log('🔒 执行安全清理（仅清理日志和缓存）...\n');
    
    this.cleanLogs();
    this.cleanPlaywrightCache();
    this.cleanNodeCache();
    this.cleanDependencyCache();
    
    console.log('\n✅ 安全清理完成');
  }
}

// 命令行参数处理
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    safe: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--safe' || arg === '-s') {
      options.safe = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

// 显示帮助信息
function showHelp() {
  console.log(`
清理脚本 - 清理浏览器实例管理器的临时文件和缓存

用法:
  node scripts/cleanup.js [选项]

选项:
  -s, --safe     安全模式（不删除重要文件）
  -h, --help     显示此帮助信息

示例:
  node scripts/cleanup.js          # 完全清理
  node scripts/cleanup.js --safe   # 安全清理
  `);
}

// 主函数
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }

  const cleanup = new CleanupScript();
  
  if (options.safe) {
    await cleanup.runSafeCleanup();
  } else {
    await cleanup.runAll();
  }
}

// 运行清理脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('清理脚本执行失败:', error);
    process.exit(1);
  });
}

export {
  CleanupScript
};

export default CleanupScript;