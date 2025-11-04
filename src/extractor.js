const axios = require('axios');
const cheerio = require('cheerio');
const {
  isValidUrl,
  normalizeUrl,
  isSupportedMediaType,
  isImageType,
  isVideoType,
  extractUrlsFromCss,
  getDomainFromUrl,
  validateMediaFilters,
  retryAsync
} = require('./utils');

class MediaExtractor {
  constructor(options = {}) {
    this.timeout = options.timeout || parseInt(process.env.DOWNLOAD_TIMEOUT) || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    this.maxRedirects = options.maxRedirects || 5;
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

    try {
      if (!isValidUrl(targetUrl)) {
        throw new Error('Invalid URL provided');
      }

      if (progressCallback) progressCallback('Fetching HTML content...');
      
      const response = await this.fetchHtml(targetUrl);
      const html = response.data;
      const baseUrl = response.request.res.responseUrl || targetUrl;

      if (progressCallback) progressCallback('Parsing HTML content...');
      
      const $ = cheerio.load(html);
      const mediaUrls = new Set();

      if (progressCallback) progressCallback('Finding media elements...');
      
      this.extractFromHtmlElements($, baseUrl, mediaUrls, validatedFilters);
      
      if (progressCallback) progressCallback('Extracting CSS background images...');
      
      this.extractFromCssStyles($, baseUrl, mediaUrls, validatedFilters);
      
      if (progressCallback) progressCallback('Processing inline styles...');
      
      this.extractFromInlineStyles($, baseUrl, mediaUrls, validatedFilters);

      if (progressCallback) progressCallback('Scanning HTML for URL patterns...');
      
      this.extractFromHtmlContent(html, baseUrl, mediaUrls, validatedFilters);

      if (progressCallback) progressCallback('Validating media URLs...');
      
      const mediaArray = Array.from(mediaUrls);
      results.stats.totalFound = mediaArray.length;
      
      for (let i = 0; i < mediaArray.length; i++) {
        const mediaUrl = mediaArray[i];
        
        if (progressCallback) {
          progressCallback(`Validating media ${i + 1}/${mediaArray.length}...`);
        }
        
        try {
          const mediaInfo = await this.validateAndGetMediaInfo(mediaUrl);
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
    }

    return results;
  }

  async fetchHtml(url) {
    return retryAsync(
      async () => {
        try {
          const response = await axios.get(url, {
            timeout: this.timeout,
            maxRedirects: this.maxRedirects,
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            },
            validateStatus: (status) => status >= 200 && status < 400
          });

          return response;
        } catch (error) {
          if (error.response) {
            throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
          } else if (error.request) {
            throw new Error('Network error: Unable to reach the website');
          } else {
            throw new Error(`Request error: ${error.message}`);
          }
        }
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
        onRetry: (attempt, maxRetries, waitTime) => {
          console.log(`Retrying HTML fetch (${attempt}/${maxRetries}) after ${waitTime}ms...`);
        }
      }
    );
  }

  extractFromHtmlElements($, baseUrl, mediaUrls, filters) {
    // Enhanced selectors to catch more media elements
    const selectors = [
      'img[src]',
      'img[data-src]',
      'img[data-lazy-src]',
      'img[data-original]',
      'img[data-lazy]',
      'img[data-srcset]',
      'img[data-background]',
      'source[src]',
      'source[srcset]',
      'video[src]',
      'video[poster]',
      'video source[src]',
      'audio[src]',
      'audio source[src]',
      '[style*="background-image"]',
      '[data-bg]',
      '[data-background-image]'
    ];

    selectors.forEach(selector => {
      $(selector).each((_, element) => {
        const $el = $(element);
        
        // Check all possible src attributes
        const srcAttributes = [
          'src', 'data-src', 'data-lazy-src', 'data-original', 
          'data-lazy', 'data-srcset', 'data-background', 'poster',
          'data-bg', 'data-background-image'
        ];
        
        srcAttributes.forEach(attr => {
          const src = $el.attr(attr);
          if (src) {
            this.addMediaUrl(src, baseUrl, mediaUrls, filters);
          }
        });

        // Handle srcset attributes
        const srcsetAttributes = ['srcset', 'data-srcset'];
        srcsetAttributes.forEach(attr => {
          const srcset = $el.attr(attr);
          if (srcset) {
            this.processSrcset(srcset, baseUrl, mediaUrls, filters);
          }
        });

        // Extract from inline styles
        const style = $el.attr('style');
        if (style) {
          this.extractFromStyleAttribute(style, baseUrl, mediaUrls, filters);
        }
      });
    });

    // Handle picture elements
    $('picture').each((_, element) => {
      const $picture = $(element);
      $picture.find('source[srcset], img[src], img[srcset]').each((_, child) => {
        const $child = $(child);
        const src = $child.attr('src');
        const srcset = $child.attr('srcset');
        
        if (src) {
          this.addMediaUrl(src, baseUrl, mediaUrls, filters);
        }
        if (srcset) {
          this.processSrcset(srcset, baseUrl, mediaUrls, filters);
        }
      });
    });

    // Look for any elements with data attributes that might contain URLs
    try {
      $('[data-*]').each((_, element) => {
        try {
          const $el = $(element);
          const attributes = element.attribs || {};
          
          Object.keys(attributes).forEach(attr => {
            if (attr.startsWith('data-') && attributes[attr]) {
              const value = attributes[attr];
              // Check if the value looks like a URL and is an image/video
              if (this.looksLikeMediaUrl(value)) {
                this.addMediaUrl(value, baseUrl, mediaUrls, filters);
              }
            }
          });
        } catch (elementError) {
          // Continue with next element if one fails
        }
      });
    } catch (selectorError) {
      // Continue if data attribute scanning fails
    }
  }

  extractFromCssStyles($, baseUrl, mediaUrls, filters) {
    $('style').each((_, element) => {
      const cssText = $(element).html();
      if (cssText) {
        const urls = extractUrlsFromCss(cssText, baseUrl);
        urls.forEach(url => {
          if (this.shouldIncludeByType(url, filters)) {
            mediaUrls.add(url);
          }
        });
      }
    });

    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const cssUrl = normalizeUrl(href, baseUrl);
        if (cssUrl) {
          this.fetchAndParseCss(cssUrl, baseUrl, mediaUrls, filters).catch(() => {});
        }
      }
    });
  }

  extractFromInlineStyles($, baseUrl, mediaUrls, filters) {
    $('[style]').each((_, element) => {
      const style = $(element).attr('style');
      if (style) {
        const urls = extractUrlsFromCss(style, baseUrl);
        urls.forEach(url => {
          if (this.shouldIncludeByType(url, filters)) {
            mediaUrls.add(url);
          }
        });
      }
    });
  }

  async fetchAndParseCss(cssUrl, baseUrl, mediaUrls, filters) {
    try {
      await retryAsync(
        async () => {
          const response = await axios.get(cssUrl, {
            timeout: this.timeout / 2,
            headers: { 'User-Agent': this.userAgent }
          });

          const urls = extractUrlsFromCss(response.data, cssUrl);
          urls.forEach(url => {
            if (this.shouldIncludeByType(url, filters)) {
              mediaUrls.add(url);
            }
          });
        },
        {
          maxRetries: 2,
          retryDelay: 500
        }
      );
    } catch (error) {
      // Silently fail CSS fetching as it's not critical
    }
  }

  processSrcset(srcset, baseUrl, mediaUrls, filters) {
    const srcsetEntries = srcset.split(',').map(entry => entry.trim());
    
    srcsetEntries.forEach(entry => {
      const urlMatch = entry.match(/^([^\s]+)/);
      if (urlMatch) {
        this.addMediaUrl(urlMatch[1], baseUrl, mediaUrls, filters);
      }
    });
  }

  addMediaUrl(src, baseUrl, mediaUrls, filters) {
    const normalizedUrl = normalizeUrl(src, baseUrl);
    if (normalizedUrl && isSupportedMediaType(normalizedUrl) && this.shouldIncludeByType(normalizedUrl, filters)) {
      mediaUrls.add(normalizedUrl);
    }
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

  async validateAndGetMediaInfo(url) {
    return retryAsync(
      async () => {
        try {
          const response = await axios.head(url, {
            timeout: this.timeout / 4,
            headers: { 'User-Agent': this.userAgent },
            maxRedirects: this.maxRedirects
          });

          const contentLength = response.headers['content-length'];
          const contentType = response.headers['content-type'];
          const lastModified = response.headers['last-modified'];

          return {
            url,
            type: isImageType(url) ? 'image' : 'video',
            size: contentLength ? parseInt(contentLength) : null,
            contentType,
            lastModified: lastModified ? new Date(lastModified) : null,
            status: response.status
          };
        } catch (error) {
          if (error.response && error.response.status === 405) {
            return {
              url,
              type: isImageType(url) ? 'image' : 'video',
              size: null,
              contentType: null,
              lastModified: null,
              status: 200
            };
          }
          throw error;
        }
      },
      {
        maxRetries: 2,
        retryDelay: 500
      }
    );
  }

  shouldIncludeMedia(mediaInfo, filters) {
    if (mediaInfo.size) {
      if (mediaInfo.size < filters.minSizeBytes || mediaInfo.size > filters.maxSizeBytes) {
        return false;
      }
    }
    return true;
  }

  extractFromStyleAttribute(style, baseUrl, mediaUrls, filters) {
    const urls = extractUrlsFromCss(style, baseUrl);
    urls.forEach(url => {
      if (this.shouldIncludeByType(url, filters)) {
        mediaUrls.add(url);
      }
    });
  }

  looksLikeMediaUrl(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Check if it looks like a URL
    const urlPattern = /^(https?:\/\/|\/\/|\/|\.\.?\/).+/i;
    if (!urlPattern.test(value)) return false;
    
    // Check if it has a media extension or contains media-related keywords
    const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)(\?|#|$)/i;
    const mediaKeywords = /(image|img|photo|picture|video|media|thumb|thumbnail|gallery)/i;
    
    return mediaExtensions.test(value) || mediaKeywords.test(value);
  }

  extractFromHtmlContent(html, baseUrl, mediaUrls, filters) {
    try {
      // Use regex to find URL patterns in the raw HTML that might be missed by DOM parsing
      const urlPatterns = [
        // Standard image extensions with quotes
        /['"]([^'"]*\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)(?:\?[^'"]*)?)['"]/gi,
        // Standard video extensions with quotes
        /['"]([^'"]*\.(?:mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)(?:\?[^'"]*)?)['"]/gi,
        // Generic media file patterns without quotes
        /(https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)(?:\?[^\s<>"']*)?)/gi
      ];

      urlPatterns.forEach(pattern => {
        try {
          let match;
          while ((match = pattern.exec(html)) !== null) {
            const url = match[1]; // Get the captured URL
            if (url && this.shouldIncludeByType(url, filters)) {
              const normalizedUrl = normalizeUrl(url, baseUrl);
              if (normalizedUrl && isSupportedMediaType(normalizedUrl)) {
                mediaUrls.add(normalizedUrl);
              }
            }
          }
        } catch (patternError) {
          // Continue with next pattern if one fails
        }
      });
    } catch (error) {
      // If HTML content parsing fails, continue without it
    }
  }
}

module.exports = MediaExtractor;