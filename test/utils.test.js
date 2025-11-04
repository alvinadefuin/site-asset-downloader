const assert = require('assert');
const {
  isValidUrl,
  isSafeUrl,
  isPrivateIP,
  sanitizeJobId,
  isValidJobId,
  sanitizeFilename,
  formatBytes,
  validateMediaFilters
} = require('../src/utils');

console.log('Running utils tests...\n');

// Test isValidUrl
console.log('Testing isValidUrl...');
assert.strictEqual(isValidUrl('https://example.com'), true, 'Should accept valid HTTPS URL');
assert.strictEqual(isValidUrl('http://example.com'), true, 'Should accept valid HTTP URL');
assert.strictEqual(isValidUrl('ftp://example.com'), false, 'Should reject FTP URL');
assert.strictEqual(isValidUrl('not-a-url'), false, 'Should reject invalid URL');
assert.strictEqual(isValidUrl(''), false, 'Should reject empty string');
console.log('✓ isValidUrl tests passed\n');

// Test isPrivateIP
console.log('Testing isPrivateIP...');
assert.strictEqual(isPrivateIP('localhost'), true, 'Should detect localhost');
assert.strictEqual(isPrivateIP('127.0.0.1'), true, 'Should detect 127.0.0.1');
assert.strictEqual(isPrivateIP('10.0.0.1'), true, 'Should detect 10.x.x.x');
assert.strictEqual(isPrivateIP('192.168.1.1'), true, 'Should detect 192.168.x.x');
assert.strictEqual(isPrivateIP('172.16.0.1'), true, 'Should detect 172.16.x.x');
assert.strictEqual(isPrivateIP('169.254.0.1'), true, 'Should detect link-local');
assert.strictEqual(isPrivateIP('8.8.8.8'), false, 'Should not flag public IP');
assert.strictEqual(isPrivateIP('example.com'), false, 'Should not flag public domain');
console.log('✓ isPrivateIP tests passed\n');

// Test isSafeUrl
console.log('Testing isSafeUrl...');
assert.strictEqual(isSafeUrl('https://example.com'), true, 'Should accept safe URL');
assert.strictEqual(isSafeUrl('http://localhost'), false, 'Should reject localhost');
assert.strictEqual(isSafeUrl('https://127.0.0.1'), false, 'Should reject 127.0.0.1');
assert.strictEqual(isSafeUrl('https://10.0.0.1'), false, 'Should reject private IP');
assert.strictEqual(isSafeUrl('https://192.168.1.1'), false, 'Should reject private network');
assert.strictEqual(isSafeUrl('https://user:pass@example.com'), false, 'Should reject URLs with credentials');
assert.strictEqual(isSafeUrl('https://169.254.169.254'), false, 'Should reject metadata endpoint');
console.log('✓ isSafeUrl tests passed\n');

// Test sanitizeJobId
console.log('Testing sanitizeJobId...');
assert.strictEqual(sanitizeJobId('abc123'), 'abc123', 'Should accept alphanumeric');
assert.strictEqual(sanitizeJobId('abc-123_def'), 'abc-123_def', 'Should accept hyphens and underscores');
assert.strictEqual(sanitizeJobId('../../../etc/passwd'), 'etcpasswd', 'Should remove path traversal');
assert.strictEqual(sanitizeJobId('job;rm -rf /'), 'jobrm-rf', 'Should remove dangerous characters');
assert.strictEqual(sanitizeJobId(''), null, 'Should reject empty string');
assert.strictEqual(sanitizeJobId(null), null, 'Should reject null');
console.log('✓ sanitizeJobId tests passed\n');

// Test isValidJobId
console.log('Testing isValidJobId...');
assert.strictEqual(isValidJobId('abc123'), true, 'Should accept valid job ID');
assert.strictEqual(isValidJobId('abc-123_def'), true, 'Should accept valid job ID with separators');
assert.strictEqual(isValidJobId('../etc/passwd'), false, 'Should reject path traversal');
assert.strictEqual(isValidJobId('job;rm'), false, 'Should reject dangerous characters');
console.log('✓ isValidJobId tests passed\n');

// Test sanitizeFilename
console.log('Testing sanitizeFilename...');
assert.strictEqual(sanitizeFilename('normal.jpg'), 'normal.jpg', 'Should keep normal filename');
assert.strictEqual(sanitizeFilename('file with spaces.jpg'), 'file_with_spaces.jpg', 'Should replace spaces');
assert.strictEqual(sanitizeFilename('file<>:|?.jpg'), 'file_.jpg', 'Should remove invalid chars');
assert.strictEqual(sanitizeFilename('a'.repeat(300)), 'a'.repeat(255), 'Should truncate long names');
console.log('✓ sanitizeFilename tests passed\n');

// Test formatBytes
console.log('Testing formatBytes...');
assert.strictEqual(formatBytes(0), '0 Bytes', 'Should format 0 bytes');
assert.strictEqual(formatBytes(1024), '1 KB', 'Should format KB');
assert.strictEqual(formatBytes(1048576), '1 MB', 'Should format MB');
assert.strictEqual(formatBytes(1073741824), '1 GB', 'Should format GB');
console.log('✓ formatBytes tests passed\n');

// Test validateMediaFilters
console.log('Testing validateMediaFilters...');
const filters1 = validateMediaFilters({});
assert.strictEqual(filters1.includeImages, true, 'Should default images to true');
assert.strictEqual(filters1.includeVideos, true, 'Should default videos to true');

const filters2 = validateMediaFilters({ includeImages: false });
assert.strictEqual(filters2.includeImages, false, 'Should respect includeImages setting');
assert.strictEqual(filters2.includeVideos, true, 'Should keep videos true');

const filters3 = validateMediaFilters({ includeImages: false, includeVideos: false });
assert.strictEqual(filters3.includeImages, true, 'Should force at least one type');
assert.strictEqual(filters3.includeVideos, true, 'Should force at least one type');

const filters4 = validateMediaFilters({ minSizeBytes: '5000', maxSizeBytes: '1000000' });
assert.strictEqual(filters4.minSizeBytes, 5000, 'Should parse minSizeBytes');
assert.strictEqual(filters4.maxSizeBytes, 1000000, 'Should parse maxSizeBytes');
console.log('✓ validateMediaFilters tests passed\n');

console.log('✅ All utils tests passed!');
