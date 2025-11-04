const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const winston = require('winston');

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['PORT'];
const optionalEnvVars = {
  MAX_FILE_SIZE: '104857600',
  DOWNLOAD_TIMEOUT: '30000',
  CONCURRENT_DOWNLOADS: '5',
  CLEANUP_INTERVAL: '3600000',
  LOG_LEVEL: 'info',
  RATE_LIMIT_WINDOW: '900000',
  RATE_LIMIT_MAX: '100',
  NODE_ENV: 'development'
};

// Check required variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('Using default values. Consider creating a .env file from .env.example');
}

// Set defaults for optional variables
Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
  if (!process.env[key]) {
    process.env[key] = defaultValue;
  }
});

// Validate numeric values
const numericVars = ['PORT', 'MAX_FILE_SIZE', 'DOWNLOAD_TIMEOUT', 'CONCURRENT_DOWNLOADS', 'CLEANUP_INTERVAL', 'RATE_LIMIT_WINDOW', 'RATE_LIMIT_MAX'];
numericVars.forEach(varName => {
  if (process.env[varName] && isNaN(parseInt(process.env[varName]))) {
    console.error(`Error: ${varName} must be a number. Got: ${process.env[varName]}`);
    process.exit(1);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
const requiredDirs = ['logs', 'downloads', 'downloads/images', 'downloads/videos'];
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'site-asset-downloader' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  hsts: false // Disable HTTPS forcing for localhost
}));

app.use(cors());
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static('public'));

app.use('/api', require('./src/routes/api'));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`🚀 Site Asset Downloader running on http://localhost:${PORT}`);
});

const cleanup = () => {
  logger.info('Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

const cleanupInterval = setInterval(() => {
  const downloadsDir = path.join(__dirname, 'downloads');
  const cutoffTime = Date.now() - (parseInt(process.env.CLEANUP_INTERVAL) || 3600000);
  
  ['images', 'videos'].forEach(subdir => {
    const dirPath = path.join(downloadsDir, subdir);
    if (fs.existsSync(dirPath)) {
      fs.readdir(dirPath, (err, files) => {
        if (err) return;
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          fs.stat(filePath, (err, stats) => {
            if (err) return;
            if (stats.mtime.getTime() < cutoffTime) {
              fs.unlink(filePath, (err) => {
                if (!err) logger.info(`Cleaned up old file: ${file}`);
              });
            }
          });
        });
      });
    }
  });
}, parseInt(process.env.CLEANUP_INTERVAL) || 3600000);

module.exports = app;