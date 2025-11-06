# Multi-stage build for faster deployment
# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Final image with Chromium
FROM zenika/alpine-chrome:124-with-node-20

LABEL maintainer="Site Asset Downloader"
LABEL description="A comprehensive web-based media extractor tool"

WORKDIR /app

# Install dumb-init for proper signal handling
USER root
RUN apk add --no-cache dumb-init && rm -rf /var/cache/apk/*

# Copy dependencies from build stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY --chown=chrome:chrome . .

# Create required directories
RUN mkdir -p downloads/images downloads/videos logs && \
    chown -R chrome:chrome /app

# Set environment variables for puppeteer-core
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Switch to non-root user
USER chrome

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]
