import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BrowserManager from '../../../src/core/BrowserManager.js';
import { LaunchMode, LaunchServerMode } from '../../../src/modes/index.js';
import { BrowserFactory } from '../../../src/browsers/BrowserFactory.js';
import { ValidationError, BrowserInstanceError } from '../../../src/utils/errors.js';

// Mock Playwright
vi.mock('playwright', () => {
  return {
    chromium: {
      launch: vi.fn(),
      launchServer: vi.fn(),
      connect: vi.fn()
    },
    firefox: {
      launch: vi.fn(),
      launchServer: vi.fn(),
      connect: vi.fn()
    },
    webkit: {
      launch: vi.fn(),
      launchServer: vi.fn(),
      connect: vi.fn()
    }
  };
});

// Mock dependencies
vi.mock('../../../src/modes/LaunchMode.js');
vi.mock('../../../src/modes/LaunchServerMode.js');
vi.mock('../../../src/browsers/BrowserFactory.js');

describe('BrowserManager', () => {
  let browserManager;
  let mockBrowser;
  let mockMode;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock browser instance
    mockBrowser = {
      isConnected: vi.fn().mockReturnValue(true),
      newContext: vi.fn(),
      close: vi.fn(),
      on: vi.fn()
    };

    // Create mock mode handler
    mockMode = {
      launch: vi.fn().mockResolvedValue(mockBrowser),
      stop: vi.fn().mockResolvedValue(undefined),
      constructor: { name: 'LaunchMode' }
    };

    // Setup BrowserFactory mock
    BrowserFactory.mockImplementation(() => {
      return {
        createBrowser: vi.fn().mockReturnValue({
          type: 'chromium',
          launcher: {},
          options: {},
          launch: vi.fn(),
          launchServer: vi.fn(),
          connect: vi.fn()
        })
      };
    });

    // Setup Mode mocks
    LaunchMode.mockImplementation(() => mockMode);
    LaunchServerMode.mockImplementation(() => mockMode);

    browserManager = new BrowserManager({
      maxInstances: 3,
      logLevel: 'error' // Only show errors during tests
    });
  });

  afterEach(async () => {
    if (browserManager) {
      await browserManager.shutdown();
    }
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const manager = new BrowserManager();
      expect(manager.config.maxInstances).toBe(10);
      expect(manager.config.defaultBrowser).toBe('chromium');
    });

    it('should merge custom config with defaults', () => {
      const manager = new BrowserManager({
        maxInstances: 5,
        defaultBrowser: 'firefox'
      });
      expect(manager.config.maxInstances).toBe(5);
      expect(manager.config.defaultBrowser).toBe('firefox');
    });
  });

  describe('launch', () => {
    it('should successfully launch a browser instance', async () => {
      const instanceInfo = await browserManager.launch('test-instance', {
        mode: 'launch',
        browser: 'chromium'
      });

      expect(instanceInfo.id).toBe('test-instance');
      expect(instanceInfo.status).toBe('running');
      expect(instanceInfo.browser).toBe(mockBrowser);
      expect(browserManager.instances.has('test-instance')).toBe(true);
    });

    it('should throw error for duplicate instance ID', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });

      await expect(
        browserManager.launch('test-instance', { mode: 'launch' })
      ).rejects.toThrow(BrowserInstanceError);
    });

    it('should throw error when max instances reached', async () => {
      // Fill up the instance pool
      for (let i = 0; i < 3; i++) {
        await browserManager.launch(`instance-${i}`, { mode: 'launch' });
      }

      await expect(
        browserManager.launch('extra-instance', { mode: 'launch' })
      ).rejects.toThrow(BrowserInstanceError);
    });

    it('should validate instance ID format', async () => {
      await expect(
        browserManager.launch('', { mode: 'launch' })
      ).rejects.toThrow(ValidationError);

      await expect(
        browserManager.launch('invalid@id', { mode: 'launch' })
      ).rejects.toThrow(ValidationError);
    });

    it('should handle launch failures gracefully', async () => {
      mockMode.launch.mockRejectedValue(new Error('Launch failed'));

      await expect(
        browserManager.launch('failing-instance', { mode: 'launch' })
      ).rejects.toThrow(BrowserInstanceError);
    });
  });

  describe('stop', () => {
    it('should stop a running instance', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });
      
      const result = await browserManager.stop('test-instance');
      
      expect(result).toBe(true);
      expect(browserManager.instances.has('test-instance')).toBe(false);
      expect(mockMode.stop).toHaveBeenCalled();
    });

    it('should throw error for non-existent instance', async () => {
      await expect(
        browserManager.stop('non-existent')
      ).rejects.toThrow(BrowserInstanceError);
    });

    it('should handle stop failures gracefully', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });
      mockMode.stop.mockRejectedValue(new Error('Stop failed'));

      await expect(
        browserManager.stop('test-instance')
      ).rejects.toThrow(BrowserInstanceError);
    });
  });

  describe('stopAll', () => {
    it('should stop all instances', async () => {
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launch' });

      await browserManager.stopAll();

      expect(browserManager.instances.size).toBe(0);
    });

    it('should handle errors when stopping instances', async () => {
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launch' });

      mockMode.stop.mockRejectedValueOnce(new Error('Stop failed'));

      // Should not throw, should continue stopping other instances
      await expect(browserManager.stopAll()).resolves.toBeUndefined();
    });
  });

  describe('newPage', () => {
    let mockContext;
    let mockPage;

    beforeEach(() => {
      mockPage = {
        goto: vi.fn(),
        title: vi.fn(),
        close: vi.fn()
      };

      mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn()
      };

      mockBrowser.newContext.mockResolvedValue(mockContext);
    });

    it('should create a new page', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });

      const result = await browserManager.newPage('test-instance');

      expect(result.page).toBe(mockPage);
      expect(result.context).toBe(mockContext);
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    it('should throw error for non-existent instance', async () => {
      await expect(
        browserManager.newPage('non-existent')
      ).rejects.toThrow(BrowserInstanceError);
    });

    it('should throw error for disconnected instance', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });
      
      // Simulate disconnected browser
      browserManager.instances.get('test-instance').status = 'disconnected';

      await expect(
        browserManager.newPage('test-instance')
      ).rejects.toThrow(BrowserInstanceError);
    });
  });

  describe('getInstance', () => {
    it('should return instance info', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });

      const instance = browserManager.getInstance('test-instance');

      expect(instance).toBeDefined();
      expect(instance.id).toBe('test-instance');
    });

    it('should return undefined for non-existent instance', () => {
      const instance = browserManager.getInstance('non-existent');
      expect(instance).toBeUndefined();
    });
  });

  describe('getAllInstances', () => {
    it('should return all instances', async () => {
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launchServer' });

      const instances = browserManager.getAllInstances();

      expect(instances).toHaveLength(2);
      expect(instances[0].id).toBe('instance-1');
      expect(instances[1].id).toBe('instance-2');
    });

    it('should return empty array when no instances', () => {
      const instances = browserManager.getAllInstances();
      expect(instances).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', async () => {
      await browserManager.launch('instance-1', { mode: 'launch' });
      await browserManager.launch('instance-2', { mode: 'launch' });

      const status = browserManager.getStatus();

      expect(status.totalInstances).toBe(2);
      expect(status.runningInstances).toBe(2);
      expect(status.maxInstances).toBe(3);
    });
  });

  describe('event handling', () => {
    it('should emit instanceCreated event', async () => {
      const handler = vi.fn();
      browserManager.on('instanceCreated', handler);

      await browserManager.launch('test-instance', { mode: 'launch' });

      expect(handler).toHaveBeenCalledWith('test-instance');
    });

    it('should emit instanceStopped event', async () => {
      const handler = vi.fn();
      browserManager.on('instanceStopped', handler);

      await browserManager.launch('test-instance', { mode: 'launch' });
      await browserManager.stop('test-instance');

      expect(handler).toHaveBeenCalledWith('test-instance');
    });

    it('should handle browser disconnect events', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });

      // Simulate browser disconnect
      const disconnectHandler = browserManager.instances.get('test-instance')
        .browser.on.mock.calls.find(call => call[0] === 'disconnected')[1];
      
      disconnectHandler();

      const instance = browserManager.getInstance('test-instance');
      expect(instance.status).toBe('disconnected');
    });
  });

  describe('recovery', () => {
    it('should attempt to recover unhealthy instances', async () => {
      await browserManager.launch('test-instance', { mode: 'launch' });

      // Mock the recoverInstance method
      const recoverSpy = vi.spyOn(browserManager, 'recoverInstance')
        .mockResolvedValue(true);

      // Trigger unhealthy event
      browserManager.healthMonitor.emit('instanceUnhealthy', 'test-instance');

      expect(recoverSpy).toHaveBeenCalledWith('test-instance');
    });
  });
});