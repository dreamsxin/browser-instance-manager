import { createLogger } from '../utils/logger.js';

export class FirefoxBrowser {
  static DEFAULT_OPTIONS = {
    headless: true,
    args: [
      '-wait-for-browser',
      '-no-remote',
      '-new-instance'
    ],
    firefoxUserPrefs: {
      'dom.webnotifications.enabled': false,
      'media.volume_scale': '0.0',
      'permissions.default.desktop-notification': 2,
      'permissions.default.geo': 2,
      'browser.tabs.disableBackgroundZombification': false,
      'browser.pagethumbnails.capturing_disabled': true,
      'browser.shell.checkDefaultBrowser': false,
      'browser.bookmarks.restore_default_bookmarks': false,
      'browser.newtabpage.enabled': false,
      'browser.newtabpage.enhanced': false,
      'browser.newtabpage.introShown': true,
      'browser.uitour.enabled': false,
      'extensions.getAddons.showPane': false,
      'extensions.webservice.discoverURL': '',
      'browser.aboutConfig.showWarning': false,
      'browser.safebrowsing.malware.enabled': false,
      'browser.safebrowsing.phishing.enabled': false,
      'privacy.trackingprotection.enabled': false,
      'privacy.trackingprotection.pbmode.enabled': false
    },
    timeout: 30000
  };

  constructor(options = {}) {
    this.logger = createLogger();
    this.options = { ...FirefoxBrowser.DEFAULT_OPTIONS, ...options };
  }

  async launch() {
    const { firefox } = await import('playwright');
    this.logger.info('Launching Firefox browser...');
    return await firefox.launch(this.options);
  }

  async launchServer() {
    const { firefox } = await import('playwright');
    this.logger.info('Launching Firefox browser server...');
    return await firefox.launchServer(this.options);
  }

  static getPrivacyArgs() {
    return [
      '-private',
      '-silent'
    ];
  }

  static getPerformancePrefs() {
    return {
      'layers.acceleration.disabled': false,
      'gfx.webrender.all': true,
      'gfx.webrender.enabled': true,
      'media.hardware-video-decoding.enabled': true,
      'javascript.options.mem.max': 4000,
      'javascript.options.mem.high_water_mark': 32
    };
  }

  static createForScraping(options = {}) {
    const scrapingOptions = {
      headless: true,
      args: [
        ...FirefoxBrowser.DEFAULT_OPTIONS.args,
        ...FirefoxBrowser.getPrivacyArgs()
      ],
      firefoxUserPrefs: {
        ...FirefoxBrowser.DEFAULT_OPTIONS.firefoxUserPrefs,
        ...FirefoxBrowser.getPerformancePrefs(),
        'general.useragent.override': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
      },
      viewport: { width: 1920, height: 1080 }
    };

    return new FirefoxBrowser({ ...scrapingOptions, ...options });
  }
}

export default FirefoxBrowser;