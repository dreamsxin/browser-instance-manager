import { MODES, BROWSER_TYPES } from '../utils/constants.js';

export const PRESETS = {
  // 网页抓取预设
  SCRAPING: {
    mode: MODES.LAUNCH_SERVER,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=TranslateUI',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--aggressive-cache-discard',
        '--max_old_space_size=4096'
      ],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
      blockImages: false,
      javaScriptEnabled: true
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    }
  },

  // 测试预设
  TESTING: {
    mode: MODES.LAUNCH,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: process.env.CI ? true : false,
      devtools: !process.env.CI,
      slowMo: process.env.CI ? 0 : 50,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ],
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 }
    }
  },

  // 生产环境预设
  PRODUCTION: {
    mode: MODES.LAUNCH_SERVER,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--aggressive-cache-discard',
        '--max_old_space_size=4096',
        '--disable-javascript-harmony-shipping'
      ],
      timeout: 60000
    },
    contextOptions: {
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true
    }
  },

  // 移动端预设
  MOBILE: {
    mode: MODES.LAUNCH,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: true,
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    },
    contextOptions: {
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true
    }
  },

  // 性能测试预设
  PERFORMANCE: {
    mode: MODES.LAUNCH_SERVER,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--aggressive-cache-discard',
        '--max_old_space_size=8192',
        '--memory-pressure-off',
        '--max-active-webgl-contexts=0'
      ],
      timeout: 120000
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true
    }
  },

  // 无头模式预设（最小资源）
  HEADLESS_MINIMAL: {
    mode: MODES.LAUNCH,
    browser: BROWSER_TYPES.CHROMIUM,
    options: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-translate',
        '--disable-background-networking',
        '--safebrowsing-disable-auto-update',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-default-apps',
        '--mute-audio',
        '--no-default-browser-check',
        '--disable-component-extensions-with-background-pages',
        '--disable-ipc-flooding-protection',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling'
      ],
      viewport: { width: 1366, height: 768 }
    },
    contextOptions: {
      javaScriptEnabled: true,
      blockImages: false
    }
  }
};

// 预设选择器
export function getPreset(presetName, customOptions = {}) {
  const preset = PRESETS[presetName.toUpperCase()];
  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  // 深度合并选项
  return {
    ...preset,
    options: { ...preset.options, ...customOptions.options },
    contextOptions: { ...preset.contextOptions, ...customOptions.contextOptions }
  };
}

// 获取所有预设名称
export function getAvailablePresets() {
  return Object.keys(PRESETS);
}

export default PRESETS;