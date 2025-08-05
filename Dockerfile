FROM node:18-alpine

LABEL maintainer="Site Asset Downloader"
LABEL description="A comprehensive web-based media extractor tool"

WORKDIR /app

RUN apk add --no-cache \
    dumb-init \
    && rm -rf /var/cache/apk/*

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN mkdir -p downloads/images downloads/videos logs && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]