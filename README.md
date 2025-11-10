# Site Asset Downloader

A comprehensive web-based media extractor tool that downloads images and videos from websites. Built with Node.js, Express, Puppeteer, and vanilla JavaScript with browser-based extraction for JavaScript-rendered content.

## Features

### Core Functionality
- **Browser-Based Extraction**: Uses Puppeteer to capture JavaScript-rendered content from SPAs and modern web applications
- **Smart Media Detection**: Extracts images and videos from HTML elements, CSS styles, network requests, and dynamically loaded content
- **Multiple Media Formats**: Supports JPG, PNG, GIF, WebP, SVG, MP4, WebM, AVI, MOV, and more
- **Bulk Downloads**: Download selected media files as a convenient ZIP archive
- **Real-time Progress**: Live progress tracking for extraction and download processes
- **Advanced Filtering**: Filter by media type, file size, and other criteria

### User Interface
- **Modern Design**: Clean, responsive interface with professional blue/gray theme
- **Grid Layout**: Visual media preview with thumbnail generation
- **Interactive Controls**: Select all, clear selection, and individual download options
- **Mobile Friendly**: Fully responsive design that works on all devices
- **Toast Notifications**: User-friendly success/error notifications

### Security & Performance
- **SSRF Protection**: Blocks access to private networks, localhost, and cloud metadata endpoints
- **Browser Pooling**: Reuses Puppeteer instances for 70% faster performance
- **Rate Limiting**: Protection against abuse with configurable limits
- **Retry Logic**: Automatic retries with exponential backoff for network failures
- **Memory Limits**: Prevents unbounded growth of active jobs
- **Input Validation**: Prevents path traversal and malicious URLs
- **Security Headers**: Helmet.js integration for security best practices
- **Health Check**: Built-in health monitoring endpoint
- **Logging**: Winston-based logging system

## Installation

### Prerequisites
- Node.js 20.0.0 or higher
- npm package manager
- Chromium/Chrome (automatically installed in Docker)

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/alvinadefuin/site-asset-downloader.git
   cd site-asset-downloader
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000`

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
MAX_FILE_SIZE=104857600          # 100MB in bytes
DOWNLOAD_TIMEOUT=30000           # 30 seconds
CONCURRENT_DOWNLOADS=5           # Max simultaneous downloads
CLEANUP_INTERVAL=3600000         # 1 hour in milliseconds
LOG_LEVEL=info                   # info, debug, warn, error
RATE_LIMIT_WINDOW=900000         # 15 minutes
RATE_LIMIT_MAX=100               # Max requests per window
NODE_ENV=development             # development or production
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `MAX_FILE_SIZE` | Maximum file download size (bytes) | 100MB |
| `DOWNLOAD_TIMEOUT` | Request timeout (milliseconds) | 30000 |
| `CONCURRENT_DOWNLOADS` | Max simultaneous downloads | 5 |
| `CLEANUP_INTERVAL` | File cleanup interval (milliseconds) | 1 hour |
| `LOG_LEVEL` | Logging level | info |
| `RATE_LIMIT_WINDOW` | Rate limiting window | 15 minutes |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### POST `/api/extract`
Extract media from a website URL using browser-based extraction.

**Request Body:**
```json
{
  "url": "https://example.com",
  "filters": {
    "includeImages": true,
    "includeVideos": true,
    "minSizeBytes": 1024,
    "maxSizeBytes": 10485760
  }
}
```

**Response:**
```json
{
  "jobId": "abc123...",
  "status": "started",
  "message": "Media extraction started",
  "estimatedTime": "10-30 seconds"
}
```

#### GET `/api/status/:jobId`
Get the status of an extraction job.

**Response:**
```json
{
  "jobId": "abc123...",
  "status": "completed",
  "media": [...],
  "stats": {
    "totalFound": 25,
    "images": 20,
    "videos": 5
  },
  "errors": []
}
```

#### POST `/api/download-bulk`
Download multiple media files as a ZIP archive.

**Request Body:**
```json
{
  "jobId": "abc123...",
  "mediaUrls": ["url1", "url2", ...]
}
```

#### GET `/api/download-zip/:jobId`
Download the ZIP archive for a bulk download job.

#### GET `/api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "uptime": 3600
}
```

## Usage Examples

### Basic Usage

1. **Enter a URL**: Input any website URL in the text field
2. **Configure Filters**: Select media types and size limits
3. **Extract Media**: Click "Extract Media" to start the process
4. **Review Results**: Browse the found media in the grid layout
5. **Download**: Select files and download individually or in bulk

### Advanced Filtering

```javascript
// Example filter configuration
{
  "includeImages": true,      // Include image files
  "includeVideos": false,     // Exclude video files
  "minSizeBytes": 5120,       // Minimum 5KB
  "maxSizeBytes": 2097152     // Maximum 2MB
}
```

### Supported Media Types

**Images:**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)
- BMP (.bmp)
- ICO (.ico)
- TIFF (.tiff)

**Videos:**
- MP4 (.mp4)
- WebM (.webm)
- AVI (.avi)
- MOV (.mov)
- MKV (.mkv)
- WMV (.wmv)
- FLV (.flv)
- M4V (.m4v)
- 3GP (.3gp)

## Deployment

### Railway

The app is optimized for Railway deployment with multi-stage Docker builds.

1. **Connect GitHub repository** to Railway
2. **Railway auto-detects** the Dockerfile
3. **Environment variables** are set via Railway dashboard
4. **Auto-deploys** on every push to main branch

**Build Time:**
- First build: ~3-4 minutes (installs Chromium dependencies)
- Subsequent builds: ~30-45 seconds (Docker layer caching)

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Docker Support

### Using Docker

1. **Build the image**:
   ```bash
   docker build -t site-asset-downloader .
   ```

2. **Run the container**:
   ```bash
   docker run -p 3000:3000 site-asset-downloader
   ```

### Using Docker Compose

1. **Start the services**:
   ```bash
   docker-compose up
   ```

2. **Stop the services**:
   ```bash
   docker-compose down
   ```

## Architecture

### Browser Extraction Flow

1. **Request received** → API validates URL and checks SSRF protection
2. **Browser pool** → Acquires page from Puppeteer browser pool
3. **Page load** → Navigates to URL and waits for network idle
4. **Network monitoring** → Captures all image/video requests
5. **DOM extraction** → Extracts media from HTML, CSS, and data attributes
6. **Validation** → Validates media URLs and filters by size
7. **Response** → Returns media list with metadata

### Security Layers

1. **Input Validation** - Sanitizes job IDs, validates URLs
2. **SSRF Protection** - Blocks private IPs, localhost, metadata endpoints
3. **Rate Limiting** - Limits requests per IP with Express trust proxy
4. **Memory Limits** - Caps active jobs (50) and completed jobs (100)
5. **Path Traversal** - Prevents directory traversal attacks

## Testing

Run the test suite:
```bash
npm test
```

Tests cover:
- SSRF protection (private IPs, localhost, metadata endpoints)
- Input validation (job IDs, URL sanitization)
- Retry logic with exponential backoff
- URL validation and normalization

## Troubleshooting

### Common Issues

#### "Invalid URL" Error
- Ensure the URL starts with `http://` or `https://`
- Check that the website is accessible from your network
- Verify the URL format is correct

#### "Forbidden URL" Error
- The URL is blocked by SSRF protection
- Cannot access private networks, localhost, or cloud metadata endpoints

#### "No media found" Result
- The website may not contain supported media types
- Check if the website blocks automated access
- Try adjusting size filters

#### Railway Deployment Issues
- **Trust proxy error**: Fixed by `app.set('trust proxy', 1)`
- **Chromium installation slow**: Expected on first build (cached afterward)
- **executablePath error**: Dockerfile sets `PUPPETEER_EXECUTABLE_PATH`

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

### Health Check

Monitor application health:
```bash
curl http://localhost:3000/health
```

## Project Structure

```
site-asset-downloader/
├── public/              # Frontend files
│   ├── index.html      # Main UI
│   ├── favicon.ico     # Custom favicon
│   └── site-asset-dl-logo.png  # Logo
├── src/                # Backend source
│   ├── routes/         # API routes
│   ├── extractor.js    # Cheerio-based extractor
│   ├── browser-extractor.js  # Puppeteer extractor
│   ├── browser-pool.js # Browser instance pooling
│   ├── downloader.js   # Download manager
│   └── utils.js        # Utility functions
├── test/               # Test files
├── logs/               # Application logs
├── downloads/          # Temporary downloads
├── Dockerfile          # Multi-stage Docker config
├── docker-compose.yml  # Docker Compose config
├── server.js           # Express server
└── package.json        # Dependencies
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Browser automation by [Puppeteer](https://pptr.dev/)
- HTML parsing by [Cheerio](https://cheerio.js.org/)
- HTTP requests with [Axios](https://axios-http.com/)
- Logging by [Winston](https://github.com/winstonjs/winston)
- Security by [Helmet.js](https://helmetjs.github.io/)

---

**A professional media extraction tool for developers and content creators.**
