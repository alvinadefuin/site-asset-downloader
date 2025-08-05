# Site Asset Downloader

A comprehensive web-based media extractor tool that downloads images and videos from websites. Built with Node.js, Express, and vanilla JavaScript.

## Features

### 🚀 Core Functionality
- **Smart Media Detection**: Extracts images and videos from HTML elements, CSS styles, and JavaScript-rendered content
- **Multiple Media Formats**: Supports JPG, PNG, GIF, WebP, SVG, MP4, WebM, AVI, MOV, and more
- **Bulk Downloads**: Download selected media files as a convenient ZIP archive
- **Real-time Progress**: Live progress tracking for extraction and download processes
- **Advanced Filtering**: Filter by media type, file size, and other criteria

### 🎨 User Interface
- **Modern Design**: Clean, responsive interface with dark/light theme support
- **Grid Layout**: Visual media preview with thumbnail generation
- **Interactive Controls**: Select all, clear selection, and individual download options
- **Mobile Friendly**: Fully responsive design that works on all devices
- **Toast Notifications**: User-friendly success/error notifications

### ⚙️ Technical Features
- **Rate Limiting**: Protection against abuse with configurable limits
- **Security Headers**: Helmet.js integration for security best practices
- **Error Handling**: Comprehensive error handling and validation
- **Automatic Cleanup**: Scheduled cleanup of temporary files
- **Health Check**: Built-in health monitoring endpoint
- **Logging**: Winston-based logging system

## Installation

### Prerequisites
- Node.js 16.0.0 or higher
- npm or yarn package manager

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
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
Extract media from a website URL.

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

## Limitations and Known Issues

### Technical Limitations
- **JavaScript-rendered content**: Cannot extract media from content loaded dynamically by JavaScript
- **Protected content**: Cannot access content behind authentication or paywalls
- **CORS restrictions**: Some websites may block cross-origin requests
- **Rate limiting**: Target websites may limit request frequency

### Security Considerations
- **File size limits**: Large files are rejected to prevent server overload
- **Content validation**: File types are validated beyond just extensions
- **Rate limiting**: Built-in protection against abuse
- **Input sanitization**: All URLs and inputs are properly validated

### Performance Notes
- **Memory usage**: Large downloads may consume significant memory
- **Concurrent limits**: Download concurrency is limited to prevent overload
- **Timeout handling**: Long-running requests are automatically terminated

## Troubleshooting

### Common Issues

#### "Invalid URL" Error
- Ensure the URL starts with `http://` or `https://`
- Check that the website is accessible from your network
- Verify the URL format is correct

#### "No media found" Result
- The website may not contain supported media types
- Media might be loaded dynamically by JavaScript
- Check if the website blocks automated access

#### Download Failures
- Check your internet connection
- Verify the media URLs are still valid
- Ensure you have sufficient disk space

#### High Memory Usage
- Reduce concurrent download limits
- Lower the maximum file size limit
- Restart the application periodically

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

## Contributing

### Development Setup

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Run tests**:
   ```bash
   npm test
   ```
5. **Commit your changes**:
   ```bash
   git commit -m 'Add amazing feature'
   ```
6. **Push to the branch**:
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Style

- Use ESLint for JavaScript linting
- Follow the existing code structure
- Add JSDoc comments for functions
- Write tests for new features
- Update documentation as needed

### Testing

Run the test suite:
```bash
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, questions, or feature requests:

1. **Check the documentation** first
2. **Search existing issues** on GitHub
3. **Create a new issue** with detailed information
4. **Provide logs** and error messages when possible

## Changelog

### Version 1.0.0
- Initial release
- Basic media extraction functionality
- Web interface with dark/light themes
- Bulk download support
- Docker containerization
- Comprehensive API documentation

## Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- HTML parsing by [Cheerio](https://cheerio.js.org/)
- HTTP requests with [Axios](https://axios-http.com/)
- Logging by [Winston](https://github.com/winstonjs/winston)
- Security by [Helmet.js](https://helmetjs.github.io/)

---

**Made with ❤️ for developers who need to extract media from websites efficiently and reliably.**