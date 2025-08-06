const puppeteer = require('puppeteer');
const { 
  isValidUrl, 
  normalizeUrl, 
  isSupportedMediaType, 
  isImageType, 
  isVideoType,
  getDomainFromUrl,
  validateMediaFilters
} = require('./utils');

class BrowserMediaExtractor {
  constructor(options = {}) {
    this.timeout = options.timeout || parseInt(process.env.DOWNLOAD_TIMEOUT) || 30000;
    this.headless = options.headless !== false;
    this.browser = null;
  }

  async extractMedia(targetUrl, filters = {}, progressCallback = null) {
    const validatedFilters = validateMediaFilters(filters);
    const results = {
      url: targetUrl,
      domain: getDomainFromUrl(targetUrl),
      timestamp: new Date().toISOString(),
      media: [],
      errors: [],
      stats: {
        totalFound: 0,
        images: 0,
        videos: 0,
        duplicatesRemoved: 0
      }
    };

    let page = null;

    try {
      if (!isValidUrl(targetUrl)) {
        throw new Error('Invalid URL provided');
      }

      if (progressCallback) progressCallback('Launching browser...');
      
      this.browser = await puppeteer.launch({ 
        headless: this.headless ? "new" : false,
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

      page = await this.browser.newPage();
      
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

      // Collect network requests to catch dynamically loaded media
      const mediaUrls = new Set();
      const networkUrls = new Set();

      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // Check if it's a media file by URL or content type
        if (isSupportedMediaType(url) || 
            contentType.startsWith('image/') || 
            contentType.startsWith('video/')) {
          networkUrls.add(url);
        }
      });

      if (progressCallback) progressCallback('Loading page...');
      
      // Navigate to the page with better error handling
      try {
        await page.goto(targetUrl, { 
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: this.timeout 
        });
      } catch (navigationError) {
        // Try alternative navigation strategy
        await page.goto(targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: this.timeout 
        });
      }

      if (progressCallback) progressCallback('Waiting for content to load...');
      
      // Wait a bit for initial content
      await page.waitForTimeout(2000);

      if (progressCallback) progressCallback('Triggering lazy loading...');
      
      // Scroll to trigger lazy loading
      await this.triggerLazyLoading(page);

      if (progressCallback) progressCallback('Simulating user interactions...');
      
      // Simulate hover interactions to trigger more content
      await this.simulateInteractions(page);

      if (progressCallback) progressCallback('Extracting media from DOM...');
      
      // Extract media URLs from the DOM
      const domMediaUrls = await this.extractFromDOM(page);
      domMediaUrls.forEach(url => mediaUrls.add(url));

      if (progressCallback) progressCallback('Processing network requests...');
      
      // Add network-captured URLs
      networkUrls.forEach(url => {
        if (this.shouldIncludeByType(url, validatedFilters)) {
          mediaUrls.add(url);
        }
      });

      if (progressCallback) progressCallback('Validating media URLs...');
      
      const mediaArray = Array.from(mediaUrls);
      results.stats.totalFound = mediaArray.length;
      
      for (let i = 0; i < mediaArray.length; i++) {
        const mediaUrl = mediaArray[i];
        
        if (progressCallback) {
          progressCallback(`Validating media ${i + 1}/${mediaArray.length}...`);
        }
        
        try {
          const mediaInfo = await this.validateMediaUrl(mediaUrl);
          if (this.shouldIncludeMedia(mediaInfo, validatedFilters)) {
            results.media.push(mediaInfo);
            
            if (isImageType(mediaUrl)) {
              results.stats.images++;
            } else if (isVideoType(mediaUrl)) {
              results.stats.videos++;
            }
          }
        } catch (error) {
          results.errors.push({
            url: mediaUrl,
            error: error.message
          });
        }
      }

      results.media.sort((a, b) => (b.size || 0) - (a.size || 0));

    } catch (error) {
      results.errors.push({
        url: targetUrl,
        error: error.message
      });
    } finally {
      if (page) {
        await page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    }

    return results;
  }

  async triggerLazyLoading(page) {
    // Scroll through the page to trigger lazy loading
    await page.evaluate(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, window.innerHeight);
        await delay(500);
      }
      
      // Scroll back to top
      window.scrollTo(0, 0);
      await delay(500);
    });
  }

  async simulateInteractions(page) {
    try {
      // Find elements that might trigger media loading on hover
      const hoverElements = await page.$$eval('[data-*], .preview, .thumbnail, .gallery-item, .media-item, video, img', 
        elements => elements.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            visible: rect.width > 0 && rect.height > 0 && 
                     rect.top >= 0 && rect.left >= 0 && 
                     rect.bottom <= window.innerHeight && 
                     rect.right <= window.innerWidth
          };
        }).filter(el => el.visible)
      );

      // Hover over elements to trigger loading
      for (let i = 0; i < Math.min(hoverElements.length, 20); i++) {
        const element = hoverElements[i];
        try {
          await page.mouse.move(element.x, element.y);
          await page.waitForTimeout(500);
        } catch (error) {
          // Continue if hover fails
        }
      }

      // Try clicking on preview/play buttons
      const clickableSelectors = [
        '.play-button',
        '.preview-button', 
        '.thumbnail',
        '[data-preview]',
        'video'
      ];

      for (const selector of clickableSelectors) {
        try {
          const elements = await page.$$(selector);
          for (let i = 0; i < Math.min(elements.length, 5); i++) {
            await elements[i].hover();
            await page.waitForTimeout(300);
          }
        } catch (error) {
          // Continue if interaction fails
        }
      }

    } catch (error) {
      // Continue if interactions fail
    }
  }

  async extractFromDOM(page) {
    return await page.evaluate(() => {
      const mediaUrls = new Set();
      
      // Enhanced selectors for dynamic content
      const selectors = [
        'img[src]', 'img[data-src]', 'img[data-lazy-src]', 'img[data-original]',
        'img[data-lazy]', 'img[data-srcset]', 'img[data-background]',
        'video[src]', 'video[poster]', 'source[src]', 'source[srcset]',
        '[style*="background-image"]', '[data-bg]', '[data-background-image]',
        '.lazy-loaded[src]', '.loaded[src]'
      ];

      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          // Check multiple attributes
          const attributes = [
            'src', 'data-src', 'data-lazy-src', 'data-original', 
            'data-lazy', 'data-srcset', 'data-background', 'poster',
            'data-bg', 'data-background-image'
          ];
          
          attributes.forEach(attr => {
            const value = element.getAttribute(attr);
            if (value && value.trim()) {
              mediaUrls.add(value.trim());
            }
          });

          // Check inline styles
          const style = element.getAttribute('style');
          if (style) {
            const bgMatch = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
            if (bgMatch) {
              mediaUrls.add(bgMatch[1]);
            }
          }
        });
      });

      // Look for URLs in data attributes of all elements
      document.querySelectorAll('[data-*]').forEach(element => {
        Array.from(element.attributes).forEach(attr => {
          if (attr.name.startsWith('data-') && attr.value) {
            // Check if the value looks like a media URL
            if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)/i.test(attr.value) ||
                /(image|img|photo|picture|video|media|thumb|thumbnail)/i.test(attr.value)) {
              mediaUrls.add(attr.value);
            }
          }
        });
      });

      return Array.from(mediaUrls);
    });
  }

  shouldIncludeByType(url, filters) {
    if (isImageType(url) && !filters.includeImages) {
      return false;
    }
    if (isVideoType(url) && !filters.includeVideos) {
      return false;
    }
    return true;
  }

  async validateMediaUrl(url) {
    // For browser-extracted URLs, we'll do a simpler validation
    return {
      url,
      type: isImageType(url) ? 'image' : 'video',
      size: null,
      contentType: null,
      lastModified: null,
      status: 200
    };
  }

  shouldIncludeMedia(mediaInfo, filters) {
    // Since we don't have size info from browser extraction, 
    // we'll include all found media
    return true;
  }
}

module.exports = BrowserMediaExtractor;