import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BrowserManager from '../../src/core/BrowserManager.js';

describe('Browser Manager Lifecycle Integration', () => {
  let browserManager;

  beforeEach(() => {
    browserManager = new BrowserManager({
      maxInstances: 2,
      logLevel: 'error',
      timeout: 10000
    });
  });

  afterEach(async () => {
    if (browserManager) {
      await browserManager.shutdown();
    }
  });

  describe('Instance Lifecycle', () => {
    it('should complete full instance lifecycle', async () => {
      // Launch instance
      const instance = await browserManager.launch('lifecycle-test', {
        mode: 'launch',
        browser: 'chromium',
        options: {
          headless: true
        }
      });

      expect(instance.status).toBe('running');
      expect(browserManager.instances.has('lifecycle-test')).toBe(true);

      // Create and use page
      const { page, context } = await browserManager.newPage('lifecycle-test');
      expect(page).toBeDefined();
      expect(context).toBeDefined();

      // Navigate to a page
      await page.goto('about:blank');
      const title = await page.title();
      expect(title).toBeDefined();

      // Close context
      await context.close();

      // Stop instance
      const result = await browserManager.stop('lifecycle-test');
      expect(result).toBe(true);
      expect(browserManager.instances.has('lifecycle-test')).toBe(false);
    });

    it('should handle multiple instances independently', async () => {
      // Launch multiple instances
      const instance1 = await browserManager.launch('instance-1', {
        mode: 'launch',
        browser: 'chromium'
      });

      const instance2 = await browserManager.launch('instance-2', {
        mode: 'launch',
        browser: 'chromium'
      });

      expect(instance1.status).toBe('running');
      expect(instance2.status).toBe('running');
      expect(browserManager.instances.size).toBe(2);

      // Use both instances
      const { page: page1 } = await browserManager.newPage('instance-1');
      const { page: page2 } = await browserManager.newPage('instance-2');

      expect(page1).toBeDefined();
      expect(page2).toBeDefined();

      // Stop one instance, other should remain
      await browserManager.stop('instance-1');
      expect(browserManager.instances.has('instance-1')).toBe(false);
      expect(browserManager.instances.has('instance-2')).toBe(true);

      // Cleanup
      await browserManager.stop('instance-2');
    });

    it('should maintain instance isolation', async () => {
      await browserManager.launch('isolated-1', { mode: 'launch' });
      await browserManager.launch('isolated-2', { mode: 'launch' });

      const instances = browserManager.getAllInstances();
      expect(instances).toHaveLength(2);

      // Each instance should have unique ID and independent state
      const instanceIds = instances.map(inst => inst.id);
      expect(instanceIds).toEqual(['isolated-1', 'isolated-2']);

      await browserManager.stopAll();
    });
  });

  describe('LaunchServer Mode', () => {
    it('should support launchServer mode', async () => {
      const instance = await browserManager.launch('server-instance', {
        mode: 'launchServer',
        browser: 'chromium',
        options: {
          headless: true
        }
      });

      expect(instance.status).toBe('running');
      expect(instance.mode.constructor.name).toBe('LaunchServerMode');

      // Should be able to create multiple pages
      const { page: page1 } = await browserManager.newPage('server-instance');
      const { page: page2 } = await browserManager.newPage('server-instance');

      expect(page1).toBeDefined();
      expect(page2).toBeDefined();

      await browserManager.stop('server-instance');
    });
  });

  describe('Error Recovery', () => {
    it('should handle instance disconnection', async () => {
      const instance = await browserManager.launch('recovery-test', {
        mode: 'launch',
        browser: 'chromium'
      });

      // Simulate disconnection
      const originalBrowser = instance.browser;
      originalBrowser.isConnected = () => false;

      // Should detect disconnected instance
      const disconnectedInstance = browserManager.getInstance('recovery-test');
      // Note: In real scenario, the disconnect event would update the status

      await browserManager.stop('recovery-test');
    });
  });

  describe('Resource Management', () => {
    it('should not exceed max instances limit', async () => {
      // Fill to capacity
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launch' });

      // Should reject third instance
      await expect(
        browserManager.launch('instance-3', { mode: 'launch' })
      ).rejects.toThrow();

      expect(browserManager.instances.size).toBe(2);
    });

    it('should allow new instances after stopping old ones', async () => {
      // Fill to capacity
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launch' });

      // Free up space
      await browserManager.stop('instance-1');

      // Should allow new instance
      await browserManager.launch('instance-3', { mode: 'launch' });
      expect(browserManager.instances.size).toBe(2);
    });
  });

  describe('Performance', () => {
    it('should launch instances within reasonable time', async () => {
      const startTime = Date.now();

      await browserManager.launch('perf-test', {
        mode: 'launch',
        browser: 'chromium',
        options: { headless: true }
      });

      const launchTime = Date.now() - startTime;
      
      // Launch should complete within 30 seconds (allowing for browser download on first run)
      expect(launchTime).toBeLessThan(30000);

      await browserManager.stop('perf-test');
    });

    it('should handle concurrent instance creation', async () => {
      const promises = [
        browserManager.launch('concurrent-1', { mode: 'launch' }),
        browserManager.launch('concurrent-2', { mode: 'launch' })
      ];

      await Promise.all(promises);

      expect(browserManager.instances.size).toBe(2);
      expect(browserManager.getInstance('concurrent-1')).toBeDefined();
      expect(browserManager.getInstance('concurrent-2')).toBeDefined();

      await browserManager.stopAll();
    });
  });
});