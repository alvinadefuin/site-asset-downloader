# Multi-stage build for optimal caching and faster rebuilds
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (this layer will be cached)
RUN npm ci --only=production && npm cache clean --force

# Final stage
FROM node:20-alpine

LABEL maintainer="Site Asset Downloader"
LABEL description="A comprehensive web-based media extractor tool"

WORKDIR /app

# Install only essential Chromium packages (optimized list)
RUN apk add --no-cache \
    chromium \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser

# Copy dependencies from build stage (cached)
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p downloads/images downloads/videos logs && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]
