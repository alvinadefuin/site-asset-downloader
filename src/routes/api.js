const express = require('express');
const fs = require('fs');
const path = require('path');
const MediaExtractor = require('../extractor');
const DownloadManager = require('../downloader');
const { createJobId, isValidUrl, formatBytes } = require('../utils');

const router = express.Router();
const extractor = new MediaExtractor();
const downloadManager = new DownloadManager();

const activeJobs = new Map();
const jobResults = new Map();

router.post('/extract', async (req, res) => {
  try {
    const { url, filters = {} } = req.body;

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ 
        error: 'Invalid URL provided',
        message: 'Please provide a valid HTTP or HTTPS URL'
      });
    }

    const jobId = createJobId();
    activeJobs.set(jobId, { 
      status: 'extracting', 
      startTime: Date.now(),
      url,
      filters
    });

    res.json({ 
      jobId, 
      status: 'started',
      message: 'Media extraction started',
      estimatedTime: '10-30 seconds'
    });

    try {
      const results = await extractor.extractMedia(url, filters, (progress) => {
        const job = activeJobs.get(jobId);
        if (job) {
          job.progress = progress;
          job.lastUpdate = Date.now();
        }
      });

      activeJobs.delete(jobId);
      jobResults.set(jobId, {
        ...results,
        jobId,
        status: 'completed',
        completedAt: new Date().toISOString()
      });

    } catch (error) {
      activeJobs.delete(jobId);
      jobResults.set(jobId, {
        jobId,
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    res.status(500).json({ 
      error: 'Extraction failed',
      message: error.message
    });
  }
});

router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (activeJobs.has(jobId)) {
    const job = activeJobs.get(jobId);
    return res.json({
      jobId,
      status: job.status,
      progress: job.progress || 'Starting...',
      startTime: job.startTime,
      duration: Date.now() - job.startTime
    });
  }

  if (jobResults.has(jobId)) {
    const result = jobResults.get(jobId);
    return res.json(result);
  }

  res.status(404).json({ 
    error: 'Job not found',
    jobId
  });
});

router.get('/download/:id', (req, res) => {
  try {
    const { id } = req.params;
    const downloadInfo = downloadManager.getDownloadInfo(id);
    
    if (!downloadInfo || !downloadInfo.filePath) {
      return res.status(404).json({ error: 'Download not found' });
    }

    if (!fs.existsSync(downloadInfo.filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stat = fs.statSync(downloadInfo.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(downloadInfo.filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': downloadInfo.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadInfo.filename}"`
      });
      
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': downloadInfo.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadInfo.filename}"`
      });
      
      fs.createReadStream(downloadInfo.filePath).pipe(res);
    }

  } catch (error) {
    res.status(500).json({ 
      error: 'Download failed',
      message: error.message
    });
  }
});

router.post('/download-bulk', async (req, res) => {
  try {
    const { jobId, mediaUrls } = req.body;

    if (!jobId || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'jobId and mediaUrls array are required'
      });
    }

    if (mediaUrls.length > 100) {
      return res.status(400).json({ 
        error: 'Too many files',
        message: 'Maximum 100 files allowed per bulk download'
      });
    }

    const downloadJobId = `bulk_${jobId}`;
    activeJobs.set(downloadJobId, { 
      status: 'downloading', 
      startTime: Date.now(),
      total: mediaUrls.length,
      completed: 0
    });

    res.json({ 
      downloadJobId,
      status: 'started',
      message: `Downloading ${mediaUrls.length} files`,
      estimatedTime: `${Math.ceil(mediaUrls.length * 2)} seconds`
    });

    try {
      const downloadResults = await downloadManager.downloadBulk(
        mediaUrls.map(url => ({ url })), 
        downloadJobId,
        (progress) => {
          const job = activeJobs.get(downloadJobId);
          if (job) {
            job.progress = progress;
            job.completed = progress.completedCount || 0;
            job.lastUpdate = Date.now();
          }
        }
      );

      const zipInfo = await downloadManager.createZipArchive(downloadResults, downloadJobId);

      activeJobs.delete(downloadJobId);
      jobResults.set(downloadJobId, {
        ...downloadResults,
        zipInfo,
        status: 'completed',
        completedAt: new Date().toISOString()
      });

    } catch (error) {
      activeJobs.delete(downloadJobId);
      jobResults.set(downloadJobId, {
        downloadJobId,
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    res.status(500).json({ 
      error: 'Bulk download failed',
      message: error.message
    });
  }
});

router.get('/download-zip/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const zipPath = path.join(__dirname, '..', '..', 'downloads', `${jobId}_archive.zip`);

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'ZIP file not found' });
    }

    const stat = fs.statSync(zipPath);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${jobId}_media.zip"`
    });

    fs.createReadStream(zipPath).pipe(res);

  } catch (error) {
    res.status(500).json({ 
      error: 'ZIP download failed',
      message: error.message
    });
  }
});

router.delete('/cleanup/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    activeJobs.delete(jobId);
    jobResults.delete(jobId);
    
    downloadManager.cleanupJob(jobId);
    
    res.json({ 
      message: 'Job cleaned up successfully',
      jobId
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

router.get('/jobs', (req, res) => {
  const jobs = [];
  
  for (const [jobId, job] of activeJobs.entries()) {
    jobs.push({
      jobId,
      status: job.status,
      startTime: job.startTime,
      progress: job.progress,
      duration: Date.now() - job.startTime
    });
  }
  
  for (const [jobId, result] of jobResults.entries()) {
    jobs.push({
      jobId,
      status: result.status,
      completedAt: result.completedAt,
      mediaCount: result.media ? result.media.length : 0,
      errors: result.errors ? result.errors.length : 0
    });
  }

  res.json({ jobs });
});

router.get('/stats', (req, res) => {
  const stats = {
    activeJobs: activeJobs.size,
    completedJobs: jobResults.size,
    totalMemoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    version: require('../../package.json').version
  };

  res.json(stats);
});


const cleanupOldJobs = () => {
  const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours
  
  for (const [jobId, result] of jobResults.entries()) {
    const completedTime = new Date(result.completedAt).getTime();
    if (completedTime < cutoffTime) {
      jobResults.delete(jobId);
      downloadManager.cleanupJob(jobId);
    }
  }
};

setInterval(cleanupOldJobs, 30 * 60 * 1000); // Run every 30 minutes

module.exports = router;