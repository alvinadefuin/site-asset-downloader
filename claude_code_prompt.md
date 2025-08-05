# Site Asset Downloader - Complete Claude Code Prompt

Create a comprehensive web-based media extractor tool that downloads images and videos from websites. Build a complete, production-ready application.

## Project Structure
```
site-asset-downloader/
├── package.json
├── server.js (main entry point)
├── .env.example
├── .gitignore
├── README.md
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── favicon.ico
├── src/
│   ├── extractor.js (core extraction logic)
│   ├── downloader.js (download management)
│   ├── utils.js (helper functions)
│   └── routes/
│       └── api.js (API endpoints)
├── downloads/ (auto-created)
│   ├── images/
│   └── videos/
└── logs/
```

## Backend Requirements (Node.js/Express)

### Dependencies to include:
- express, cors, helmet (server basics)
- cheerio (HTML parsing)
- axios (HTTP requests)
- archiver (ZIP creation)
- multer (file handling)
- express-rate-limit (rate limiting)
- winston (logging)
- dotenv (environment config)
- mime-types (file type detection)
- url, path (built-in utilities)

### API Endpoints:
```
POST /api/extract - Accept URL and options, return found media
GET /api/download/:id - Download individual file
POST /api/download-bulk - Create and download ZIP archive
GET /api/status/:jobId - Check extraction progress
DELETE /api/cleanup/:jobId - Clean temporary files
```

### Core Extraction Logic:
- Parse HTML with Cheerio to find all media elements
- Handle: img[src], img[srcset], source[src], video[src], audio[src]
- Extract CSS background-image URLs using regex
- Support data-src and data-lazy attributes for lazy loading
- Convert relative URLs to absolute using URL constructor
- Filter by extensions: .jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.mp4,.webm,.avi,.mov,.mkv,.wmv,.flv
- Remove duplicates using Set with normalized URLs
- Validate URLs and check accessibility with HEAD requests

## Frontend Requirements (Vanilla JS/HTML/CSS)

### UI Components:
1. **Input Section**:
   - URL input with validation
   - Media type checkboxes (Images, Videos, All)
   - Size filters (min/max MB sliders)
   - Extract button with loading state

2. **Results Section**:
   - Grid layout for media previews
   - Thumbnail generation for images
   - File info (name, size, type)
   - Individual download buttons
   - Select all/bulk download options
   - Progress bars for downloads

3. **Status/Info Panel**:
   - Extraction progress
   - Found media count
   - Total size calculation
   - Error messages and logs

### Styling:
- Modern, clean design with CSS Grid/Flexbox
- Responsive layout (mobile-friendly)
- Dark/light theme toggle
- Loading animations and progress indicators
- Toast notifications for success/error states

## Advanced Features Implementation:

### 1. Progress Tracking:
- Use Server-Sent Events (SSE) for real-time progress
- Track extraction phases: "Fetching HTML", "Parsing content", "Finding media", "Validating URLs"
- Show download progress with percentage and speed

### 2. Smart Media Detection:
- Check for JavaScript-rendered content (mention limitations)
- Handle srcset and picture elements properly
- Detect and extract from popular CDNs (Cloudinary, etc.)
- Support for common social media embed patterns

### 3. Download Management:
- Queue system for multiple simultaneous downloads
- Retry logic for failed downloads
- Bandwidth throttling options
- Resume capability for large files
- Automatic filename conflict resolution

### 4. Error Handling & Validation:
- URL format validation with proper regex
- HTTP status code handling (404, 403, etc.)
- Timeout management (configurable)
- CORS and security restriction handling
- File size limits and disk space checks
- Malformed HTML graceful handling

## Configuration & Environment:
Create .env with:
```
PORT=3000
MAX_FILE_SIZE=100MB
DOWNLOAD_TIMEOUT=30000
CONCURRENT_DOWNLOADS=5
CLEANUP_INTERVAL=3600000
LOG_LEVEL=info
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

## Security & Performance:
- Helmet.js for security headers
- Rate limiting per IP address
- Input sanitization and URL validation
- File type verification beyond extensions
- Temporary file cleanup scheduler
- Request timeout and size limits
- Basic logging with Winston (requests, errors, performance)

## README Requirements:
Include comprehensive documentation:
- Installation instructions (npm install, node version requirements)
- Environment setup and configuration
- API documentation with examples
- Usage examples and screenshots
- Limitations and known issues
- Contributing guidelines
- License information

## Additional Specifications:
- Add proper TypeScript JSDoc comments throughout
- Include basic unit tests for core functions
- Add Docker support (Dockerfile and docker-compose.yml)
- Implement graceful shutdown handling
- Add health check endpoint (/health)
- Include package.json scripts for dev, start, test
- Support for custom user agents and headers
- Basic analytics (successful extractions, popular domains)

## Error Scenarios to Handle:
- Invalid URLs or unreachable websites
- Protected/authenticated content
- Rate limiting from target sites
- Large files exceeding limits
- Network timeouts and interruptions
- Malformed HTML or unusual site structures
- CORS restrictions and blocked requests

## Final Notes:
Build this as a complete, deployable application that someone could immediately run with `npm install && npm start`. Focus on reliability, user experience, and proper error handling throughout. Make the code clean, well-commented, and production-ready with proper separation of concerns and modular architecture.