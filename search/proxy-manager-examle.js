// 使用示例
async function example() {
  const proxyManager = new ProxyIPManager({
    host: '127.0.0.1',
    port: 6379
  });

  try {
    // 示例 1: 从普通文本文件导入到待检查队列
    console.log('=== 从普通文本文件导入 ===');
    await proxyManager.importFromFile('proxies.txt', {
      queue: 'checking',
      format: 'plain',
      defaultMetadata: {
        source: 'file_import',
        protocol: 'http'
      }
    });

    // 示例 2: 从 JSON 文件导入到可用队列
    console.log('\n=== 从 JSON 文件导入 ===');
    await proxyManager.importFromFile('proxies.json', {
      queue: 'available',
      format: 'json'
    });

    // 示例 3: 批量导入目录下的所有代理文件
    console.log('\n=== 批量导入目录 ===');
    await proxyManager.importFromDirectory('./proxy_files', {
      queue: 'checking',
      filePattern: /\.(txt|json)$/i,
      defaultMetadata: {
        source: 'batch_import',
        importBatch: '2024'
      }
    });

    // 示例 4: 导出代理到文件
    console.log('\n=== 导出代理 ===');
    await proxyManager.exportToFile('exported_proxies.txt', {
      queue: 'available',
      format: 'plain'
    });

    // 检查导入结果
    const stats = await proxyManager.getQueueStats();
    console.log('\n=== 队列统计 ===');
    console.log('可用代理:', stats.availableCount);
    console.log('待检查代理:', stats.checkingCount);
    console.log('总计:', stats.totalCount);

  } catch (error) {
    console.error('示例运行失败:', error);
  } finally {
    await proxyManager.disconnect();
  }
}

// 运行示例
example();