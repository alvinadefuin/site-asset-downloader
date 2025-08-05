class SiteAssetDownloader {
    constructor() {
        this.currentJobId = null;
        this.currentResults = null;
        this.selectedMedia = new Set();
        this.currentFilter = 'all';
        this.currentSort = 'size-desc';
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.theme = localStorage.getItem('theme') || 'light';
        
        this.initializeTheme();
        this.bindEvents();
        this.updateUI();
    }

    initializeTheme() {
        if (this.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            themeIcon.textContent = this.theme === 'dark' ? '☀️' : '🌙';
        }
    }

    bindEvents() {
        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
        
        // URL input validation
        const urlInput = document.getElementById('urlInput');
        urlInput?.addEventListener('input', () => this.validateUrl());
        urlInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.extractMedia();
        });
        
        // Extract button
        document.getElementById('extractBtn')?.addEventListener('click', () => this.extractMedia());
        
        // Results controls
        document.getElementById('selectAllBtn')?.addEventListener('click', () => this.selectAll());
        document.getElementById('clearSelectionBtn')?.addEventListener('click', () => this.clearSelection());
        document.getElementById('downloadSelectedBtn')?.addEventListener('click', () => this.downloadSelected());
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });
        
        // Sort select
        document.getElementById('sortSelect')?.addEventListener('change', (e) => this.setSort(e.target.value));
        
        // Pagination
        document.getElementById('prevPageBtn')?.addEventListener('click', () => this.prevPage());
        document.getElementById('nextPageBtn')?.addEventListener('click', () => this.nextPage());
        
        // Modal events
        document.getElementById('modalClose')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modalCloseBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('previewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') this.closeModal();
        });
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', this.theme);
        this.initializeTheme();
    }

    validateUrl() {
        const urlInput = document.getElementById('urlInput');
        const validation = document.getElementById('urlValidation');
        const url = urlInput?.value?.trim();
        
        if (!url) {
            urlInput?.classList.remove('border-red-500');
            validation.textContent = '';
            return true;
        }
        
        try {
            new URL(url);
            if (url.startsWith('http://') || url.startsWith('https://')) {
                urlInput?.classList.remove('border-red-500');
                validation.textContent = '';
                validation.className = 'text-sm ml-1 text-green-600';
                return true;
            } else {
                throw new Error('Invalid protocol');
            }
        } catch {
            urlInput?.classList.add('border-red-500');
            validation.textContent = 'Please enter a valid HTTP or HTTPS URL';
            validation.className = 'text-sm ml-1 text-red-600';
            return false;
        }
    }

    async extractMedia() {
        if (!this.validateUrl()) {
            this.showToast('Please enter a valid URL', 'error');
            return;
        }
        
        const url = document.getElementById('urlInput')?.value?.trim();
        const includeImages = document.getElementById('includeImages')?.checked ?? true;
        const includeVideos = document.getElementById('includeVideos')?.checked ?? true;
        const minSize = (document.getElementById('minSize')?.value || 0) * 1024;
        const maxSize = (document.getElementById('maxSize')?.value || 100) * 1024 * 1024;
        
        if (!includeImages && !includeVideos) {
            this.showToast('Please select at least one media type', 'warning');
            return;
        }
        
        const filters = {
            includeImages,
            includeVideos,
            minSizeBytes: minSize,
            maxSizeBytes: maxSize
        };
        
        try {
            this.setExtracting(true);
            this.showSection('statusSection');
            this.hideSection('resultsSection');
            
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, filters })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Extraction failed');
            }
            
            this.currentJobId = data.jobId;
            this.pollJobStatus(data.jobId);
            
        } catch (error) {
            this.setExtracting(false);
            this.hideSection('statusSection');
            this.showToast(error.message, 'error');
        }
    }

    async pollJobStatus(jobId) {
        try {
            const response = await fetch(`/api/status/${jobId}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get job status');
            }
            
            this.updateStatus(data);
            
            if (data.status === 'completed') {
                this.currentResults = data;
                this.displayResults(data);
                this.setExtracting(false);
                this.hideSection('statusSection');
            } else if (data.status === 'failed') {
                throw new Error(data.error || 'Extraction failed');
            } else {
                setTimeout(() => this.pollJobStatus(jobId), 1000);
            }
            
        } catch (error) {
            this.setExtracting(false);
            this.hideSection('statusSection');
            this.showToast(error.message, 'error');
        }
    }

    updateStatus(data) {
        const statusTitle = document.getElementById('statusTitle');
        const progressText = document.getElementById('progressText');
        const statusDetails = document.getElementById('statusDetails');
        
        if (statusTitle) statusTitle.textContent = `Processing: ${data.url || 'Unknown URL'}`;
        if (progressText) progressText.textContent = data.progress || 'Processing...';
        if (statusDetails) statusDetails.textContent = `Duration: ${this.formatDuration(data.duration || 0)}`;
    }

    displayResults(data) {
        this.showSection('resultsSection');
        
        const resultsTitle = document.getElementById('resultsTitle');
        const resultsStats = document.getElementById('resultsStats');
        
        if (resultsTitle) {
            resultsTitle.textContent = `Found ${data.media?.length || 0} Media Files`;
        }
        
        if (resultsStats) {
            const stats = data.stats || {};
            resultsStats.innerHTML = `
                <span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full">Images: ${stats.images || 0}</span>
                <span class="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full">Videos: ${stats.videos || 0}</span>
                <span class="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-3 py-1 rounded-full">Errors: ${data.errors?.length || 0}</span>
            `;
        }
        
        this.selectedMedia.clear();
        this.currentPage = 1;
        this.renderMediaGrid();
        this.updateSelectedCount();
    }

    renderMediaGrid() {
        const mediaGrid = document.getElementById('mediaGrid');
        if (!mediaGrid || !this.currentResults?.media) return;
        
        let filteredMedia = this.filterMedia(this.currentResults.media);
        filteredMedia = this.sortMedia(filteredMedia);
        
        const totalPages = Math.ceil(filteredMedia.length / this.itemsPerPage);
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const currentPageMedia = filteredMedia.slice(startIndex, endIndex);
        
        mediaGrid.innerHTML = currentPageMedia.map((media, index) => 
            this.createMediaItemHTML(media, startIndex + index)
        ).join('');
        
        this.updatePagination(totalPages);
        this.bindMediaEvents();
    }

    filterMedia(media) {
        if (this.currentFilter === 'all') return media;
        return media.filter(item => {
            if (this.currentFilter === 'images') return item.type === 'image';
            if (this.currentFilter === 'videos') return item.type === 'video';
            return true;
        });
    }

    sortMedia(media) {
        return [...media].sort((a, b) => {
            switch (this.currentSort) {
                case 'size-desc':
                    return (b.size || 0) - (a.size || 0);
                case 'size-asc':
                    return (a.size || 0) - (b.size || 0);
                case 'type':
                    return a.type.localeCompare(b.type);
                case 'name':
                    return this.getFilename(a.url).localeCompare(this.getFilename(b.url));
                default:
                    return 0;
            }
        });
    }

    createMediaItemHTML(media, index) {
        const filename = this.getFilename(media.url);
        const isSelected = this.selectedMedia.has(index);
        const fileSize = media.size ? this.formatBytes(media.size) : 'Unknown';
        const typeColor = media.type === 'image' ? 'bg-blue-500' : 'bg-purple-500';
        
        return `
            <div class="media-item bg-white dark:bg-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer border-2 ${isSelected ? 'border-blue-500' : 'border-transparent'} hover:border-gray-300 dark:hover:border-gray-600" data-index="${index}">
                <div class="relative aspect-video bg-gray-100 dark:bg-gray-600 overflow-hidden">
                    ${media.type === 'image' 
                        ? `<img src="${media.url}" alt="${filename}" class="w-full h-full object-cover" loading="lazy" onerror="this.style.display='none'">`
                        : `<video class="w-full h-full object-cover" preload="none">
                             <source src="${media.url}" type="${media.contentType || 'video/mp4'}">
                           </video>`
                    }
                    <div class="absolute top-2 left-2 ${typeColor} text-white text-xs px-2 py-1 rounded-md font-medium">${media.type.toUpperCase()}</div>
                    <div class="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white ${isSelected ? 'bg-blue-500' : 'bg-black bg-opacity-30'} flex items-center justify-center media-select" data-index="${index}">
                        ${isSelected ? '<span class="text-white text-sm">✓</span>' : ''}
                    </div>
                </div>
                <div class="p-4">
                    <h4 class="font-medium text-gray-900 dark:text-white mb-2 truncate" title="${filename}">${filename}</h4>
                    <div class="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 mb-3">
                        <span>${fileSize}</span>
                        <span class="truncate ml-2">${media.contentType || 'Unknown'}</span>
                    </div>
                    <div class="flex gap-2">
                        <button class="preview-btn flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors text-sm font-medium" data-index="${index}">Preview</button>
                        <button class="download-btn px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium" data-index="${index}">Download</button>
                    </div>
                </div>
            </div>
        `;
    }

    bindMediaEvents() {
        // Media selection
        document.querySelectorAll('.media-select').forEach(select => {
            select.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMediaSelection(parseInt(e.target.closest('.media-select').dataset.index));
            });
        });
        
        // Preview buttons
        document.querySelectorAll('.preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.previewMedia(parseInt(e.target.dataset.index));
            });
        });
        
        // Download buttons
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.downloadSingleMedia(parseInt(e.target.dataset.index));
            });
        });
        
        // Media item click for selection
        document.querySelectorAll('.media-item').forEach(item => {
            item.addEventListener('click', () => {
                this.toggleMediaSelection(parseInt(item.dataset.index));
            });
        });
    }

    toggleMediaSelection(index) {
        if (this.selectedMedia.has(index)) {
            this.selectedMedia.delete(index);
        } else {
            this.selectedMedia.add(index);
        }
        
        this.renderMediaGrid();
        this.updateSelectedCount();
    }

    selectAll() {
        if (!this.currentResults?.media) return;
        
        const filteredMedia = this.filterMedia(this.currentResults.media);
        filteredMedia.forEach((_, index) => {
            this.selectedMedia.add(index);
        });
        
        this.renderMediaGrid();
        this.updateSelectedCount();
    }

    clearSelection() {
        this.selectedMedia.clear();
        this.renderMediaGrid();
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const selectedCount = document.getElementById('selectedCount');
        const downloadBtn = document.getElementById('downloadSelectedBtn');
        
        if (selectedCount) selectedCount.textContent = this.selectedMedia.size;
        if (downloadBtn) downloadBtn.disabled = this.selectedMedia.size === 0;
    }

    async downloadSelected() {
        if (this.selectedMedia.size === 0) {
            this.showToast('Please select media to download', 'warning');
            return;
        }
        
        const selectedMediaUrls = Array.from(this.selectedMedia).map(index => 
            ({ url: this.currentResults.media[index].url })
        );
        
        try {
            this.showSection('downloadSection');
            
            const response = await fetch('/api/download-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: this.currentJobId,
                    mediaUrls: selectedMediaUrls.map(m => m.url)
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Download failed');
            }
            
            this.pollDownloadStatus(data.downloadJobId);
            
        } catch (error) {
            this.hideSection('downloadSection');
            this.showToast(error.message, 'error');
        }
    }

    async pollDownloadStatus(downloadJobId) {
        try {
            const response = await fetch(`/api/status/${downloadJobId}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get download status');
            }
            
            this.updateDownloadStatus(data);
            
            if (data.status === 'completed') {
                this.hideSection('downloadSection');
                this.downloadZip(downloadJobId);
                this.showToast(`Successfully downloaded ${data.completed?.length || 0} files!`, 'success');
            } else if (data.status === 'failed') {
                throw new Error(data.error || 'Download failed');
            } else {
                setTimeout(() => this.pollDownloadStatus(downloadJobId), 1000);
            }
            
        } catch (error) {
            this.hideSection('downloadSection');
            this.showToast(error.message, 'error');
        }
    }

    updateDownloadStatus(data) {
        const progressFill = document.getElementById('downloadProgressFill');
        const downloadCount = document.getElementById('downloadCount');
        const downloadCurrent = document.getElementById('downloadCurrent');
        
        const progress = data.progress || {};
        const completed = progress.completedCount || 0;
        const total = progress.totalCount || data.total || 0;
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        
        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (downloadCount) downloadCount.textContent = `${completed} / ${total}`;
        if (downloadCurrent) {
            downloadCurrent.textContent = progress.currentFile 
                ? `Downloading: ${progress.currentFile}` 
                : 'Processing downloads...';
        }
    }

    downloadZip(downloadJobId) {
        const link = document.createElement('a');
        link.href = `/api/download-zip/${downloadJobId}`;
        link.download = `${downloadJobId}_media.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async downloadSingleMedia(index) {
        const media = this.currentResults.media[index];
        if (!media) return;
        
        try {
            const response = await fetch('/api/download-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: `single_${Date.now()}`,
                    mediaUrls: [media.url]
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            const pollSingle = async () => {
                const statusResponse = await fetch(`/api/status/${data.downloadJobId}`);
                const statusData = await statusResponse.json();
                
                if (statusData.status === 'completed') {
                    this.downloadZip(data.downloadJobId);
                    this.showToast('Download started!', 'success');
                } else if (statusData.status === 'failed') {
                    throw new Error(statusData.error);
                } else {
                    setTimeout(pollSingle, 500);
                }
            };
            
            pollSingle();
            
        } catch (error) {
            this.showToast(`Download failed: ${error.message}`, 'error');
        }
    }

    previewMedia(index) {
        const media = this.currentResults.media[index];
        if (!media) return;
        
        const modal = document.getElementById('previewModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalDownload = document.getElementById('modalDownload');
        
        const filename = this.getFilename(media.url);
        
        if (modalTitle) modalTitle.textContent = filename;
        
        if (modalBody) {
            if (media.type === 'image') {
                modalBody.innerHTML = `
                    <div class="text-center">
                        <img src="${media.url}" alt="${filename}" class="max-w-full max-h-[60vh] object-contain mx-auto rounded-lg">
                    </div>
                `;
            } else {
                modalBody.innerHTML = `
                    <div class="text-center">
                        <video controls class="max-w-full max-h-[60vh] mx-auto rounded-lg">
                            <source src="${media.url}" type="${media.contentType || 'video/mp4'}">
                            Your browser does not support the video tag.
                        </video>
                    </div>
                `;
            }
            
            modalBody.innerHTML += `
                <div class="mt-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <p><strong class="text-gray-900 dark:text-white">URL:</strong> <a href="${media.url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all">${media.url}</a></p>
                    <p><strong class="text-gray-900 dark:text-white">Type:</strong> <span class="text-gray-700 dark:text-gray-300">${media.type}</span></p>
                    <p><strong class="text-gray-900 dark:text-white">Size:</strong> <span class="text-gray-700 dark:text-gray-300">${media.size ? this.formatBytes(media.size) : 'Unknown'}</span></p>
                    <p><strong class="text-gray-900 dark:text-white">Content Type:</strong> <span class="text-gray-700 dark:text-gray-300">${media.contentType || 'Unknown'}</span></p>
                </div>
            `;
        }
        
        if (modalDownload) {
            modalDownload.onclick = () => {
                this.downloadSingleMedia(index);
                this.closeModal();
            };
        }
        
        if (modal) modal.classList.remove('hidden');
    }

    closeModal() {
        const modal = document.getElementById('previewModal');
        if (modal) modal.classList.add('hidden');
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.currentPage = 1;
        
        document.querySelectorAll('.filter-tab').forEach(tab => {
            if (tab.dataset.filter === filter) {
                tab.classList.add('bg-white', 'dark:bg-gray-800', 'text-gray-900', 'dark:text-white', 'shadow-sm');
                tab.classList.remove('text-gray-600', 'dark:text-gray-400');
            } else {
                tab.classList.remove('bg-white', 'dark:bg-gray-800', 'text-gray-900', 'dark:text-white', 'shadow-sm');
                tab.classList.add('text-gray-600', 'dark:text-gray-400');
            }
        });
        
        this.renderMediaGrid();
    }

    setSort(sort) {
        this.currentSort = sort;
        this.renderMediaGrid();
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderMediaGrid();
        }
    }

    nextPage() {
        const filteredMedia = this.filterMedia(this.currentResults?.media || []);
        const totalPages = Math.ceil(filteredMedia.length / this.itemsPerPage);
        
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderMediaGrid();
        }
    }

    updatePagination(totalPages) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageInfo = document.getElementById('pageInfo');
        
        if (totalPages <= 1) {
            if (pagination) pagination.classList.add('hidden');
            return;
        }
        
        if (pagination) pagination.classList.remove('hidden');
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        if (nextBtn) nextBtn.disabled = this.currentPage === totalPages;
        if (pageInfo) pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
    }

    setExtracting(extracting) {
        const extractBtn = document.getElementById('extractBtn');
        const btnText = document.getElementById('btnText');
        const spinner = document.getElementById('loadingSpinner');
        
        if (extractBtn) extractBtn.disabled = extracting;
        if (btnText) btnText.style.display = extracting ? 'none' : 'inline';
        if (spinner) spinner.style.display = extracting ? 'inline' : 'none';
    }

    showSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) section.classList.remove('hidden');
    }

    hideSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const colorClasses = {
            success: 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900 dark:border-green-600 dark:text-green-200',
            error: 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900 dark:border-red-600 dark:text-red-200',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-700 dark:bg-yellow-900 dark:border-yellow-600 dark:text-yellow-200',
            info: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-200'
        };
        
        const toast = document.createElement('div');
        toast.className = `${colorClasses[type] || colorClasses.info} border-l-4 p-4 rounded-md shadow-lg max-w-sm animate-pulse opacity-0 transition-opacity duration-300`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Fade in
        setTimeout(() => toast.classList.remove('opacity-0'), 10);
        
        // Fade out and remove
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    getFilename(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            return pathname.split('/').pop() || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    updateUI() {
        this.hideSection('statusSection');
        this.hideSection('resultsSection');
        this.hideSection('downloadSection');
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SiteAssetDownloader();
});