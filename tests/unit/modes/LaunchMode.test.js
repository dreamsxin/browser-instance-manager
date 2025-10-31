import { describe, it, expect, beforeEach, vi } from 'vitest';
import LaunchMode from '../../../src/modes/LaunchMode.js';

describe('LaunchMode', () => {
  let launchMode;
  let mockBrowser;
  let mockLauncher;

  beforeEach(() => {
    mockLauncher = {
      launch: vi.fn()
    };

    mockBrowser = {
      launcher: mockLauncher,
      options: {
        headless: true,
        args: ['--test-arg']
      }
    };

    launchMode = new LaunchMode(mockBrowser, {
      headless: true,
      timeout: 30000
    });
  });

  describe('launch', () => {
    it('should launch browser successfully', async () => {
      const mockBrowserInstance = { isConnected: vi.fn().mockReturnValue(true) };
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);

      const result = await launchMode.launch();

      expect(result).toBe(mockBrowserInstance);
      expect(mockLauncher.launch).toHaveBeenCalledWith({
        headless: true,
        args: ['--test-arg'],
        timeout: 30000
      });
      expect(launchMode.isLaunched).toBe(true);
    });

    it('should handle launch failures', async () => {
      const error = new Error('Launch failed');
      mockLauncher.launch.mockRejectedValue(error);

      await expect(launchMode.launch()).rejects.toThrow('Launch failed');
      expect(launchMode.isLaunched).toBe(false);
    });

    it('should validate required options', async () => {
      launchMode = new LaunchMode(mockBrowser, {});
      
      // Should not throw when headless is provided in browser options
      mockBrowser.options.headless = true;
      mockLauncher.launch.mockResolvedValue({});
      
      await expect(launchMode.launch()).resolves.toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop browser successfully', async () => {
      const mockBrowserInstance = { close: vi.fn() };
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);
      await launchMode.launch();

      await launchMode.stop();

      expect(mockBrowserInstance.close).toHaveBeenCalled();
      expect(launchMode.isLaunched).toBe(false);
    });

    it('should handle stop when not launched', async () => {
      await expect(launchMode.stop()).resolves.toBeUndefined();
    });

    it('should handle stop failures', async () => {
      const mockBrowserInstance = { 
        close: vi.fn().mockRejectedValue(new Error('Close failed')) 
      };
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);
      await launchMode.launch();

      await expect(launchMode.stop()).rejects.toThrow('Close failed');
    });
  });

  describe('createContext', () => {
    it('should create context successfully', async () => {
      const mockBrowserInstance = { 
        newContext: vi.fn().mockResolvedValue({}) 
      };
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);
      await launchMode.launch();

      const contextOptions = { viewport: { width: 800, height: 600 } };
      await launchMode.createContext(contextOptions);

      expect(mockBrowserInstance.newContext).toHaveBeenCalledWith(contextOptions);
    });

    it('should throw error when browser not launched', async () => {
      await expect(launchMode.createContext()).rejects.toThrow('Browser not launched');
    });
  });

  describe('createPage', () => {
    it('should create page successfully', async () => {
      const mockContext = { newPage: vi.fn().mockResolvedValue({}) };
      const mockBrowserInstance = { 
        newContext: vi.fn().mockResolvedValue(mockContext) 
      };
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);
      await launchMode.launch();

      const result = await launchMode.createPage();

      expect(result.page).toBeDefined();
      expect(result.context).toBe(mockContext);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics', async () => {
      const mockBrowserInstance = {};
      mockLauncher.launch.mockResolvedValue(mockBrowserInstance);
      await launchMode.launch();

      const metrics = launchMode.getMetrics();

      expect(metrics.mode).toBe('launch');
      expect(metrics.isLaunched).toBe(true);
      expect(metrics.launchTime).toBeDefined();
    });
  });
});