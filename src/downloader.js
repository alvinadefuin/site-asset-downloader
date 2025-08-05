const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { 
  generateUniqueFilename, 
  formatBytes, 
  isImageType, 
  isVideoType,
  delay 
} = require('./utils');

class DownloadManager {
  constructor(options = {}) {
    this.concurrent = options.concurrent || parseInt(process.env.CONCURRENT_DOWNLOADS) || 5;
    this.timeout = options.timeout || parseInt(process.env.DOWNLOAD_TIMEOUT) || 30000;
    this.userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    this.maxFileSize = options.maxFileSize || parseInt(process.env.MAX_FILE_SIZE) || 104857600; // 100MB
    this.downloadQueue = [];
    this.activeDownloads = new Map();
    this.completedDownloads = new Map();
    this.failedDownloads = new Map();
    this.downloadStats = new Map();
  }

  async downloadFile(url, jobId, progressCallback = null) {
    const downloadId = `${jobId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      if (this.activeDownloads.size >= this.concurrent) {
        await this.waitForSlot();
      }

      this.activeDownloads.set(downloadId, { url, jobId, startTime: Date.now() });

      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });

      const contentLength = parseInt(response.headers['content-length']) || 0;
      const contentType = response.headers['content-type'] || '';

      if (contentLength > this.maxFileSize) {
        throw new Error(`File too large: ${formatBytes(contentLength)} exceeds ${formatBytes(this.maxFileSize)}`);
      }

      const isImage = isImageType(url);
      const downloadDir = path.join(__dirname, '..', 'downloads', isImage ? 'images' : 'videos');
      
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const existingFiles = fs.readdirSync(downloadDir);
      const filename = generateUniqueFilename(url, existingFiles);
      const filePath = path.join(downloadDir, filename);

      let downloadedBytes = 0;
      const writeStream = fs.createWriteStream(filePath);

      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        
        if (progressCallback) {
          const progress = contentLength > 0 ? (downloadedBytes / contentLength) * 100 : 0;
          progressCallback({
            downloadId,
            url,
            progress: Math.round(progress),
            downloadedBytes,
            totalBytes: contentLength,
            speed: this.calculateSpeed(downloadId, downloadedBytes)
          });
        }

        if (downloadedBytes > this.maxFileSize) {
          writeStream.destroy();
          fs.unlink(filePath, () => {});
          throw new Error(`File too large: Download exceeds ${formatBytes(this.maxFileSize)}`);
        }
      });

      response.data.on('error', (error) => {
        writeStream.destroy();
        fs.unlink(filePath, () => {});
        throw error;
      });

      response.data.pipe(writeStream);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        response.data.on('error', reject);
      });

      const stats = fs.statSync(filePath);
      const downloadInfo = {
        downloadId,
        url,
        filename,
        filePath,
        size: stats.size,
        contentType,
        downloadTime: Date.now() - this.activeDownloads.get(downloadId).startTime,
        type: isImage ? 'image' : 'video'
      };

      this.completedDownloads.set(downloadId, downloadInfo);
      this.activeDownloads.delete(downloadId);
      this.downloadStats.delete(downloadId);

      return downloadInfo;

    } catch (error) {
      this.activeDownloads.delete(downloadId);
      this.downloadStats.delete(downloadId);
      this.failedDownloads.set(downloadId, { url, error: error.message, timestamp: Date.now() });
      throw error;
    }
  }

  async downloadBulk(mediaList, jobId, progressCallback = null) {
    const results = {
      jobId,
      total: mediaList.length,
      completed: [],
      failed: [],
      startTime: Date.now(),
      endTime: null
    };

    const downloadPromises = mediaList.map(async (media, index) => {
      try {
        await delay(index * 100); // Stagger requests slightly
        
        const downloadInfo = await this.downloadFile(media.url, jobId, (progress) => {
          if (progressCallback) {
            progressCallback({
              ...progress,
              mediaIndex: index,
              totalMedia: mediaList.length,
              completedCount: results.completed.length,
              failedCount: results.failed.length
            });
          }
        });

        results.completed.push(downloadInfo);
        
        if (progressCallback) {
          progressCallback({
            type: 'bulk_progress',
            completedCount: results.completed.length,
            totalCount: results.total,
            currentFile: downloadInfo.filename
          });
        }

      } catch (error) {
        results.failed.push({
          url: media.url,
          error: error.message,
          timestamp: Date.now()
        });
        
        if (progressCallback) {
          progressCallback({
            type: 'bulk_progress',
            completedCount: results.completed.length,
            failedCount: results.failed.length,
            totalCount: results.total,
            error: error.message
          });
        }
      }
    });

    await Promise.allSettled(downloadPromises);
    
    results.endTime = Date.now();
    results.duration = results.endTime - results.startTime;

    return results;
  }

  async createZipArchive(downloadResults, jobId) {
    const zipPath = path.join(__dirname, '..', 'downloads', `${jobId}_archive.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        const stats = fs.statSync(zipPath);
        resolve({
          zipPath,
          filename: `${jobId}_archive.zip`,
          size: stats.size,
          fileCount: downloadResults.completed.length
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      downloadResults.completed.forEach((download) => {
        if (fs.existsSync(download.filePath)) {
          archive.file(download.filePath, { 
            name: `${download.type}s/${download.filename}` 
          });
        }
      });

      const manifestContent = JSON.stringify({
        jobId,
        createdAt: new Date().toISOString(),
        totalFiles: downloadResults.completed.length,
        totalSize: downloadResults.completed.reduce((sum, d) => sum + d.size, 0),
        files: downloadResults.completed.map(d => ({
          filename: d.filename,
          originalUrl: d.url,
          size: d.size,
          type: d.type,
          contentType: d.contentType
        }))
      }, null, 2);

      archive.append(manifestContent, { name: 'manifest.json' });
      archive.finalize();
    });
  }

  calculateSpeed(downloadId, downloadedBytes) {
    const now = Date.now();
    const stats = this.downloadStats.get(downloadId);
    
    if (!stats) {
      this.downloadStats.set(downloadId, {
        startTime: now,
        lastUpdate: now,
        lastBytes: downloadedBytes
      });
      return 0;
    }

    const timeDiff = now - stats.lastUpdate;
    if (timeDiff < 1000) return stats.lastSpeed || 0; // Update every second

    const bytesDiff = downloadedBytes - stats.lastBytes;
    const speed = Math.round(bytesDiff / (timeDiff / 1000)); // bytes per second

    this.downloadStats.set(downloadId, {
      ...stats,
      lastUpdate: now,
      lastBytes: downloadedBytes,
      lastSpeed: speed
    });

    return speed;
  }

  async waitForSlot() {
    while (this.activeDownloads.size >= this.concurrent) {
      await delay(100);
    }
  }

  getJobStatus(jobId) {
    const active = Array.from(this.activeDownloads.values()).filter(d => d.jobId === jobId);
    const completed = Array.from(this.completedDownloads.values()).filter(d => d.url.includes(jobId));
    const failed = Array.from(this.failedDownloads.values()).filter(d => d.url.includes(jobId));

    return {
      jobId,
      status: active.length > 0 ? 'downloading' : 'completed',
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      totalSize: completed.reduce((sum, d) => sum + d.size, 0)
    };
  }

  cleanupJob(jobId) {
    // Remove completed downloads for this job
    for (const [key, value] of this.completedDownloads.entries()) {
      if (value.url.includes(jobId)) {
        // Optionally delete the file
        if (fs.existsSync(value.filePath)) {
          fs.unlink(value.filePath, () => {});
        }
        this.completedDownloads.delete(key);
      }
    }

    // Remove failed downloads for this job
    for (const [key, value] of this.failedDownloads.entries()) {
      if (value.url.includes(jobId)) {
        this.failedDownloads.delete(key);
      }
    }

    // Clean up zip file if exists
    const zipPath = path.join(__dirname, '..', 'downloads', `${jobId}_archive.zip`);
    if (fs.existsSync(zipPath)) {
      fs.unlink(zipPath, () => {});
    }
  }

  getDownloadInfo(downloadId) {
    return this.completedDownloads.get(downloadId) || 
           this.activeDownloads.get(downloadId) || 
           this.failedDownloads.get(downloadId);
  }
}

module.exports = DownloadManager;