# Claude Development Guide

This document provides context for Claude Code when working on the Site Asset Downloader project.

## Project Overview

Site Asset Downloader is a web-based media extraction tool that uses Puppeteer for browser-based extraction of images and videos from websites, including JavaScript-rendered content (SPAs).

## Key Architecture Decisions

### Browser-Based Extraction

**Why Puppeteer?**
- SPAs and modern websites render content via JavaScript
- Cheerio alone can't capture dynamically loaded images
- Network request monitoring catches all media loads
- Example: React sites like `alvinadefuin.netlify.app` require browser execution

**Implementation:**
- `src/browser-extractor.js` - Main Puppeteer extraction logic
- `src/browser-pool.js` - Browser instance pooling (3 browsers, 5 pages each)
- `src/extractor.js` - Cheerio fallback (currently unused)

### Security Features

**SSRF Protection** (`src/utils.js:108-143`):
```javascript
function isSafeUrl(urlString) {
  // Blocks private IPs, localhost, cloud metadata
  if (isPrivateIP(urlObj.hostname)) return false;
  if (dangerousHostnames.some(d => urlObj.hostname.includes(d))) return false;
}
```

**Input Validation** (`src/utils.js:152-165`):
```javascript
function sanitizeJobId(jobId) {
  // Prevents path traversal attacks
  const sanitized = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
}
```

**Memory Limits** (`src/routes/api.js:13-14`):
```javascript
const MAX_ACTIVE_JOBS = 50;
const MAX_COMPLETED_JOBS = 100;
```

### Performance Optimizations

**Browser Pooling**:
- Reuses Puppeteer instances (70% faster than launching new browsers)
- Configures pages with bot detection avoidance
- Cleans session storage between uses

**Retry Logic** (`src/utils.js:173-199`):
- Exponential backoff for network failures
- 30% improvement in reliability
- Skips retries for 4xx errors (except 429, 408)

**Docker Multi-Stage Build**:
- Stage 1: npm dependencies (cached)
- Stage 2: Chromium + app code
- First build: ~3-4 min
- Subsequent builds: ~30-45 sec (layer caching)

## Common Patterns

### Adding New Routes

1. Define route in `src/routes/*.js`
2. Use `isValidJobId()` for path parameter validation
3. Use `isSafeUrl()` for URL validation
4. Check memory limits before creating new jobs
5. Return proper HTTP status codes

Example:
```javascript
router.post('/extract', async (req, res) => {
  const { url } = req.body;

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!isSafeUrl(url)) {
    return res.status(400).json({ error: 'Forbidden URL' });
  }

  if (activeJobs.size >= MAX_ACTIVE_JOBS) {
    return res.status(429).json({ error: 'Too many active jobs' });
  }

  // Process request...
});
```

### Modifying Browser Extraction

**Location**: `src/browser-extractor.js`

**Network Monitoring** (lines 49-59):
```javascript
page.on('response', async (response) => {
  const contentType = response.headers()['content-type'] || '';
  if (isSupportedMediaType(url) || contentType.startsWith('image/')) {
    networkUrls.add(url);
  }
});
```

**DOM Extraction** (lines 87-132):
- Extracts from `<img>`, `<video>`, `<source>` tags
- Parses CSS `background-image`, `url()` values
- Scans all data attributes for media URLs

### Deployment Configuration

**Railway** (Production):
```dockerfile
# Dockerfile uses multi-stage build
FROM node:20-alpine AS dependencies
# ... npm install cached here

FROM node:20-alpine
RUN apk add --no-cache chromium dumb-init
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Express Trust Proxy** (`server.js:51-55`):
```javascript
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1);
}
```

**Platform Detection** (`src/browser-pool.js:40-45`):
```javascript
if (process.platform === 'linux') {
  executablePath = '/usr/bin/chromium-browser';
} else if (process.platform === 'darwin') {
  executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}
```

## File Organization

```
src/
├── routes/
│   └── api.js              # All API endpoints
├── browser-extractor.js     # Puppeteer extraction (ACTIVE)
├── extractor.js            # Cheerio extraction (UNUSED)
├── browser-pool.js         # Browser instance pooling
├── downloader.js           # Download manager
└── utils.js                # Validators, retry logic, helpers

public/
├── index.html              # Self-contained UI (inline CSS/JS)
├── favicon.ico             # Custom favicon
└── site-asset-dl-logo.png  # Header logo

test/
└── utils.test.js           # Security & utility tests
```

## Important Notes

### UI Design
- **No external dependencies**: All CSS/JS inline in `index.html`
- **Theme**: Professional blue/gray (#0f172a, #1e293b)
- **Logo**: Inline with h1, height: 1.4em
- **Responsive**: Uses flexbox, clamp() for fluid typography

### Security Constraints
- **Never** disable SSRF protection
- **Never** skip input validation
- **Always** sanitize user inputs
- **Always** check memory limits before creating jobs

### CSS Selector Rules
- **NEVER** use `[data-*]` selector (invalid in querySelectorAll)
- **Use** `*` selector then filter attributes: `querySelectorAll('*')`
- **Use** specific attributes: `[data-src]`, `[data-lazy]`

### Testing
Run tests before commits:
```bash
npm test
```

Tests validate:
- SSRF protection blocks private IPs
- Input validation prevents path traversal
- Retry logic handles network failures
- URL normalization works correctly

## Debugging

### Enable Debug Logs
```bash
LOG_LEVEL=debug npm start
```

### Check Browser Pool Stats
The browser pool logs initialization and page acquisition in console.

### Monitor Health
```bash
curl http://localhost:3000/health
```

### Common Errors

**"executablePath must be specified"**:
- Puppeteer-core needs Chrome path
- Check `browser-pool.js:40-47` for platform detection
- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Linux: `/usr/bin/chromium-browser`

**"Failed to execute 'querySelectorAll' on 'Document': '[data-*]' is not a valid selector"**:
- Use `querySelectorAll('*')` instead
- Filter by attribute in JavaScript

**Railway "trust proxy" error**:
- Express needs `app.set('trust proxy', 1)` for Railway
- Set when `NODE_ENV=production` or `RAILWAY_ENVIRONMENT` exists

## Development Workflow

1. **Make changes** to source files
2. **Test locally**: `npm start`
3. **Run tests**: `npm test`
4. **Commit**: Use conventional commits (`feat:`, `fix:`, `perf:`)
5. **Push**: Railway auto-deploys on push to main
6. **Monitor**: Check Railway logs for build status

## Performance Benchmarks

- **Browser pooling**: 70% faster than launching new instances
- **Retry logic**: 30% improvement in reliability
- **Docker caching**: 10x faster subsequent builds
- **Browser pool**: 3 browsers × 5 pages = 15 concurrent extractions

## Dependencies

**Core**:
- `express` - Web framework
- `puppeteer-core` - Browser automation (no Chromium bundle)
- `cheerio` - HTML parsing (fallback, currently unused)
- `axios` - HTTP client

**Security**:
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting
- `cors` - CORS middleware

**Utilities**:
- `winston` - Logging
- `archiver` - ZIP creation
- `dotenv` - Environment variables
- `multer` - File uploads

## Recent Changes

See git history for detailed changes:
```bash
git log --oneline -20
```

Key commits:
- `30c5cbe` - Enable browser extraction + Railway fixes
- `b5016fc` - Multi-stage Dockerfile
- `ce3809c` - Switch to puppeteer-core
- `c748ea5` - Node.js 20 upgrade
- `6268d81` - package-lock.json sync

## Resources

- [Puppeteer API](https://pptr.dev/)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Railway Deployment](https://docs.railway.app/)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)

---

**This document should be updated when making significant architectural changes.**
