const url = require('url');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.m4v', '.3gp'];
const SUPPORTED_EXTENSIONS = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

function isValidUrl(urlString) {
  try {
    const urlObj = new URL(urlString);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateIP(hostname) {
  // Check for localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Check for IPv4 private ranges
  const ipv4Patterns = [
    /^10\./,                       // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,                 // 192.168.0.0/16
    /^169\.254\./,                 // 169.254.0.0/16 (link-local)
    /^127\./                       // 127.0.0.0/8 (loopback)
  ];

  if (ipv4Patterns.some(pattern => pattern.test(hostname))) {
    return true;
  }

  // Check for IPv6 private/local addresses
  if (hostname.includes(':')) {
    const ipv6Patterns = [
      /^fe80:/i,    // Link-local
      /^fc00:/i,    // Unique local
      /^fd00:/i,    // Unique local
      /^::1$/,      // Loopback
      /^::/         // Unspecified
    ];
    return ipv6Patterns.some(pattern => pattern.test(hostname));
  }

  return false;
}

function isSafeUrl(urlString) {
  if (!isValidUrl(urlString)) {
    return false;
  }

  try {
    const urlObj = new URL(urlString);
    const hostname = urlObj.hostname;

    // Reject private/internal IPs
    if (isPrivateIP(hostname)) {
      return false;
    }

    // Reject URLs with credentials embedded
    if (urlObj.username || urlObj.password) {
      return false;
    }

    // Reject file:// and other non-http protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    // Additional checks for metadata endpoints (cloud services)
    const dangerousHostnames = [
      'metadata.google.internal',
      '169.254.169.254',          // AWS, Azure, Google Cloud metadata
      'instance-data'
    ];

    if (dangerousHostnames.some(dangerous => hostname.includes(dangerous))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(urlString, baseUrl) {
  try {
    if (urlString.startsWith('//')) {
      return new URL(`https:${urlString}`).href;
    }
    if (urlString.startsWith('/')) {
      const base = new URL(baseUrl);
      return new URL(urlString, `${base.protocol}//${base.host}`).href;
    }
    if (urlString.startsWith('http')) {
      return new URL(urlString).href;
    }
    return new URL(urlString, baseUrl).href;
  } catch {
    return null;
  }
}

function getFileExtension(urlString) {
  try {
    const urlObj = new URL(urlString);
    const pathname = urlObj.pathname;
    const ext = path.extname(pathname).toLowerCase();
    return ext || null;
  } catch {
    return null;
  }
}

function isSupportedMediaType(urlString) {
  const ext = getFileExtension(urlString);
  if (ext && SUPPORTED_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  // Also check for URLs that might be media files without extensions
  // or with query parameters that obscure the extension
  const mediaPatterns = [
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)/i,
    /(image|img|photo|picture|video|media|thumb|thumbnail|gallery)/i,
    /\/storage.*\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|mp4|webm|avi|mov|mkv|wmv|flv|m4v|3gp)/i
  ];
  
  return mediaPatterns.some(pattern => pattern.test(urlString));
}

function isImageType(urlString) {
  const ext = getFileExtension(urlString);
  return ext && SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

function isVideoType(urlString) {
  const ext = getFileExtension(urlString);
  return ext && SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

function generateUniqueFilename(originalUrl, existingFiles = []) {
  try {
    const urlObj = new URL(originalUrl);
    let filename = path.basename(urlObj.pathname) || 'download';
    
    if (!path.extname(filename)) {
      const mimeType = mime.lookup(originalUrl);
      if (mimeType) {
        const ext = mime.extension(mimeType);
        if (ext) filename += `.${ext}`;
      }
    }
    
    filename = sanitizeFilename(filename);
    
    if (!existingFiles.includes(filename)) {
      return filename;
    }
    
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    
    let newFilename;
    do {
      newFilename = `${base}_${counter}${ext}`;
      counter++;
    } while (existingFiles.includes(newFilename));
    
    return newFilename;
  } catch {
    const hash = crypto.createHash('md5').update(originalUrl).digest('hex').substring(0, 8);
    return `download_${hash}`;
  }
}

function extractUrlsFromCss(cssText, baseUrl) {
  const urls = [];
  const urlRegex = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let match;
  
  while ((match = urlRegex.exec(cssText)) !== null) {
    const cssUrl = match[1];
    const normalizedUrl = normalizeUrl(cssUrl, baseUrl);
    if (normalizedUrl && isSupportedMediaType(normalizedUrl)) {
      urls.push(normalizedUrl);
    }
  }
  
  return urls;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function createJobId() {
  return crypto.randomBytes(16).toString('hex');
}

function validateMediaFilters(filters = {}) {
  const validated = {
    includeImages: filters.includeImages !== false,
    includeVideos: filters.includeVideos !== false,
    minSizeBytes: Math.max(0, parseInt(filters.minSizeBytes) || 0),
    maxSizeBytes: parseInt(filters.maxSizeBytes) || Infinity
  };
  
  if (!validated.includeImages && !validated.includeVideos) {
    validated.includeImages = true;
    validated.includeVideos = true;
  }
  
  return validated;
}

function getDomainFromUrl(urlString) {
  try {
    return new URL(urlString).hostname;
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryAsync(fn, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (error.response) {
        const status = error.response.status;
        // Don't retry on client errors (except 429 Too Many Requests and 408 Request Timeout)
        if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
          throw error;
        }
      }

      if (attempt < maxRetries) {
        const waitTime = retryDelay * Math.pow(backoffMultiplier, attempt);

        if (onRetry) {
          onRetry(attempt + 1, maxRetries, waitTime, error);
        }

        await delay(waitTime);
      }
    }
  }

  throw lastError;
}

function sanitizeJobId(jobId) {
  // Only allow alphanumeric characters and hyphens/underscores
  // Prevent path traversal attacks
  if (!jobId || typeof jobId !== 'string') {
    return null;
  }

  // Remove any path separators and special characters
  const sanitized = jobId.replace(/[^a-zA-Z0-9_-]/g, '');

  // Ensure it's not empty after sanitization
  if (sanitized.length === 0 || sanitized.length > 64) {
    return null;
  }

  return sanitized;
}

function isValidJobId(jobId) {
  const sanitized = sanitizeJobId(jobId);
  return sanitized !== null && sanitized === jobId;
}

module.exports = {
  isValidUrl,
  isSafeUrl,
  isPrivateIP,
  normalizeUrl,
  getFileExtension,
  isSupportedMediaType,
  isImageType,
  isVideoType,
  sanitizeFilename,
  sanitizeJobId,
  isValidJobId,
  generateUniqueFilename,
  extractUrlsFromCss,
  formatBytes,
  formatDuration,
  createJobId,
  validateMediaFilters,
  getDomainFromUrl,
  delay,
  retryAsync,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_EXTENSIONS
};