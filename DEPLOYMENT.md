# Deployment Guide

## Deploy to Vercel

### Prerequisites
- Vercel account (sign up at vercel.com)
- Vercel CLI installed: `npm i -g vercel`

### Quick Deploy

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Deploy**
   ```bash
   vercel
   ```

   Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N**
   - Project name? `media-extractor` (or your preferred name)
   - Directory? `./` (press Enter)
   - Override settings? **N**

3. **Production Deploy**
   ```bash
   vercel --prod
   ```

### Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

```
PORT=3000
MAX_FILE_SIZE=104857600
DOWNLOAD_TIMEOUT=30000
CONCURRENT_DOWNLOADS=5
CLEANUP_INTERVAL=3600000
LOG_LEVEL=info
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
NODE_ENV=production
```

### Post-Deployment

- Your app will be available at: `https://your-project.vercel.app`
- All HTTPS/TLS issues will be automatically resolved
- Vercel handles SSL certificates automatically
- No more localhost HTTPS upgrade issues!

### Important Notes

1. **Puppeteer on Vercel**:
   - Vercel has size limits, Puppeteer might not work
   - Consider using a service like Browserless.io for browser automation
   - Or deploy browser features to a different service (Railway, Render)

2. **File Storage**:
   - Vercel's filesystem is ephemeral (read-only except /tmp)
   - Downloads will be temporary
   - Consider using S3 or similar for persistent storage

3. **Alternative: Railway.app**
   - Better for apps with Puppeteer
   - No file system restrictions
   - Free tier available
   - Deploy: `railway up`

### Troubleshooting

**If extraction fails on Vercel:**
- The basic HTML extraction will work
- Browser-based extraction (Puppeteer) won't work due to Vercel limitations
- Solution: Remove Puppeteer dependency or use a dedicated browser service

**To disable Puppeteer for Vercel:**
1. Comment out browser-extractor.js import in api routes
2. Remove puppeteer from package.json
3. Redeploy

### GitHub Integration (Recommended)

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Vercel will auto-deploy on every push to main branch
4. Get preview deployments for PRs automatically

```bash
git push origin feature/security-and-performance-improvements
# Then merge to main on GitHub
# Vercel will auto-deploy!
```
