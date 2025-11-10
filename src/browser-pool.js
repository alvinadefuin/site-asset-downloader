const puppeteer = require('puppeteer-core');

class BrowserPool {
  constructor(options = {}) {
    this.maxBrowsers = options.maxBrowsers || 3;
    this.maxPagesPerBrowser = options.maxPagesPerBrowser || 5;
    this.timeout = options.timeout || 30000;
    this.browsers = [];
    this.availablePages = [];
    this.busyPages = new Set();
    this.initPromise = null;
  }

  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log('Initializing browser pool...');

      try {
        // Start with one browser
        const browser = await this.createBrowser();
        this.browsers.push(browser);
        console.log(`Browser pool initialized with 1 browser`);
      } catch (error) {
        console.error('Failed to initialize browser pool:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  async createBrowser() {
    // Determine Chrome executable path based on platform
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

    if (!executablePath) {
      if (process.platform === 'linux') {
        executablePath = '/usr/bin/chromium-browser';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      // Windows and other platforms: puppeteer-core will try to find Chrome automatically
    }

    return await puppeteer.launch({
      executablePath,
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: this.timeout
    });
  }

  async acquirePage() {
    if (!this.initPromise) {
      await this.initialize();
    } else {
      await this.initPromise;
    }

    // Check if there's an available page
    if (this.availablePages.length > 0) {
      const page = this.availablePages.pop();
      this.busyPages.add(page);
      return page;
    }

    // Check if we can create a new page from existing browsers
    for (const browser of this.browsers) {
      if (browser.isConnected()) {
        const pages = await browser.pages();
        if (pages.length < this.maxPagesPerBrowser) {
          const page = await browser.newPage();
          await this.configurePage(page);
          this.busyPages.add(page);
          return page;
        }
      }
    }

    // Create new browser if under limit
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await this.createBrowser();
      this.browsers.push(browser);
      const page = await browser.newPage();
      await this.configurePage(page);
      this.busyPages.add(page);
      console.log(`Created new browser. Total browsers: ${this.browsers.length}`);
      return page;
    }

    // Wait for a page to become available
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        if (this.availablePages.length > 0) {
          clearInterval(checkInterval);
          const page = this.availablePages.pop();
          this.busyPages.add(page);
          resolve(page);
        }
      }, 100);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for available page'));
      }, 30000);
    });
  }

  async configurePage(page) {
    // Enhanced bot detection avoidance
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Remove automation indicators
      delete navigator.__proto__.webdriver;

      // Mock chrome runtime
      window.chrome = {
        runtime: {}
      };

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set viewport for proper rendering
    await page.setViewport({ width: 1366, height: 768 });

    // Set additional headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document'
    });
  }

  async releasePage(page) {
    if (!page) return;

    this.busyPages.delete(page);

    try {
      // Clear page state
      await page.goto('about:blank');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Add back to available pages
      this.availablePages.push(page);
    } catch (error) {
      // If page is broken, close it
      try {
        await page.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
  }

  async getStats() {
    const stats = {
      totalBrowsers: this.browsers.length,
      availablePages: this.availablePages.length,
      busyPages: this.busyPages.size,
      maxBrowsers: this.maxBrowsers,
      maxPagesPerBrowser: this.maxPagesPerBrowser
    };

    return stats;
  }

  async shutdown() {
    console.log('Shutting down browser pool...');

    // Close all pages
    for (const page of [...this.availablePages, ...this.busyPages]) {
      try {
        await page.close();
      } catch (error) {
        // Ignore errors
      }
    }

    this.availablePages = [];
    this.busyPages.clear();

    // Close all browsers
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        // Ignore errors
      }
    }

    this.browsers = [];
    this.initPromise = null;
    console.log('Browser pool shut down');
  }
}

// Singleton instance
let browserPoolInstance = null;

function getBrowserPool(options) {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool(options);
  }
  return browserPoolInstance;
}

module.exports = { BrowserPool, getBrowserPool };
