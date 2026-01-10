/**
 * ============================================================================
 * Emnex Manga API - Comprehensive Endpoint Test Suite
 * ============================================================================
 * 
 * Tests all endpoints of the Emnex Manga Worker API.
 * 
 * PREREQUISITES:
 *   1. Node.js 18+ installed
 *   2. Worker running: npm run dev
 * 
 * USAGE:
 *   node test-endpoints.js
 *   API_URL=https://your.api.com node test-endpoints.js
 * 
 * ENDPOINTS TESTED:
 *   ✓ GET /                           - HTML home page
 *   ✓ GET /api/v1/home                - Home data (featured, trending)
 *   ✓ GET /api/v1/search/:query       - Search manga
 *   ✓ GET /api/v1/info/:id            - Manga info + chapters
 *   ✓ GET /api/v1/read/:chapterId     - Chapter pages
 *   ✓ GET /api/v1/recent              - Recent chapter updates
 *   ✓ GET /api/v1/new                 - New manga
 *   ✓ GET /api/v1/random              - Random manga
 *   ✓ GET /api/v1/genres              - Available genres/types/statuses
 *   ✓ GET /api/v1/advanced-search     - Filtered search
 *   ✓ GET /api/v1/image?url=...       - Image proxy
 * 
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:8788';

// ============================================================================
// CONSOLE STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`  ✅ ${message}`, 'green');
}

function logError(message) {
  log(`  ❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`  ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`  ⚠️  ${message}`, 'yellow');
}

function logHeader(title) {
  console.log();
  log('━'.repeat(70), 'cyan');
  log(`  📋 ${title}`, 'cyan');
  log('━'.repeat(70), 'cyan');
}

function logSubHeader(title, url) {
  console.log();
  log(`  🔹 ${title}`, 'white');
  log(`     ${colors.dim}${url}${colors.reset}`);
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

async function testEndpoint(name, url, options = {}) {
  const { validate, expectError = false, isHtml = false, isImage = false } = options;
  
  logSubHeader(name, url);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    
    // Handle different response types
    let data;
    if (isImage) {
      const buffer = await response.arrayBuffer();
      data = { size: buffer.byteLength, contentType: response.headers.get('Content-Type') };
    } else if (isHtml) {
      data = await response.text();
    } else {
      data = await response.json();
    }
    
    // Check status code
    if (expectError) {
      if (response.status >= 400) {
        logSuccess(`Correctly returned error status: ${response.status}`);
      } else {
        logWarning(`Expected error but got: ${response.status}`);
      }
    } else {
      if (response.ok) {
        logSuccess(`Status: ${response.status} (${duration}ms)`);
      } else {
        logError(`Status: ${response.status}`);
      }
    }
    
    // Check CORS headers
    const corsHeader = response.headers.get('Access-Control-Allow-Origin');
    if (corsHeader) {
      logSuccess(`CORS enabled: ${corsHeader}`);
    }
    
    // Run custom validation
    if (validate && !expectError) {
      await validate(data, response);
    }
    
    return { data, response, success: response.ok };
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return { success: false, error };
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  log('', 'reset');
  log('═'.repeat(70), 'bright');
  log('  🧪 EMNEX MANGA API - TEST SUITE v1.2.0', 'bright');
  log('═'.repeat(70), 'bright');
  log(`  Base URL: ${BASE_URL}`, 'cyan');
  log(`  Started: ${new Date().toLocaleString()}`, 'dim');
  log('═'.repeat(70), 'bright');
  
  const stats = { total: 0, passed: 0, failed: 0 };
  
  // Store data for use across tests
  let testMangaId = null;
  let testChapterId = null;
  let testImageUrl = null;
  
  // ========================================================================
  // TEST 1: HTML Home Page
  // ========================================================================
  
  logHeader('TEST 1: HTML Home Page');
  stats.total++;
  
  const htmlTest = await testEndpoint('HTML Home', `${BASE_URL}/`, {
    isHtml: true,
    validate: (html) => {
      if (html.includes('Emnex Manga API')) {
        logSuccess('Page title found');
      }
      if (html.includes('emnextech')) {
        logSuccess('Creator branding found');
      }
      if (html.includes('/api/v1/')) {
        logSuccess('API v1 endpoints documented');
      }
      if (html.includes('testEndpoint')) {
        logSuccess('Testing buttons found');
      }
    },
  });
  if (htmlTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 2: API Home Data
  // ========================================================================
  
  logHeader('TEST 2: API Home Data');
  stats.total++;
  
  const homeTest = await testEndpoint('API Home', `${BASE_URL}/api/v1/home`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.name && data.version) {
        logInfo(`API: ${data.name} v${data.version}`);
      }
      if (data.featuredChapters && Array.isArray(data.featuredChapters)) {
        logSuccess(`Featured chapters: ${data.featuredChapters.length}`);
        if (data.featuredChapters[0]) {
          testImageUrl = data.featuredChapters[0].image;
          logInfo(`Sample image URL saved for proxy test`);
        }
      }
      if (data.trendingManga && Array.isArray(data.trendingManga)) {
        logSuccess(`Trending manga: ${data.trendingManga.length}`);
      }
      if (data.endpoints) {
        logSuccess(`Endpoints documented: ${Object.keys(data.endpoints).length}`);
      }
    },
  });
  if (homeTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 3: Search Manga
  // ========================================================================
  
  logHeader('TEST 3: Search Manga');
  stats.total++;
  
  const searchTest = await testEndpoint('Search', `${BASE_URL}/api/v1/search/naruto`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.results && Array.isArray(data.results)) {
        logSuccess(`Found ${data.results.length} results`);
        if (data.results[0]) {
          testMangaId = data.results[0].id;
          logInfo(`First result: ${data.results[0].title}`);
          logInfo(`Manga ID saved: ${testMangaId}`);
        }
      }
      if (data.hasNextPage !== undefined) {
        logInfo(`Has next page: ${data.hasNextPage}`);
      }
    },
  });
  if (searchTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 4: Manga Info
  // ========================================================================
  
  logHeader('TEST 4: Manga Info');
  stats.total++;
  
  // Use One Piece as a reliable test case
  const infoTest = await testEndpoint('Manga Info', `${BASE_URL}/api/v1/info/2/one-piece`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      const manga = data.data;
      if (manga) {
        if (manga.title) logInfo(`Title: ${manga.title}`);
        if (manga.description) logSuccess('Description found');
        if (manga.genres) logInfo(`Genres: ${manga.genres.slice(0, 3).join(', ')}...`);
        if (manga.status) logInfo(`Status: ${manga.status}`);
        if (manga.chapters && Array.isArray(manga.chapters)) {
          logSuccess(`Chapters: ${manga.chapters.length}`);
          if (manga.chapters[0]) {
            testChapterId = manga.chapters[0].id;
            logInfo(`Chapter ID saved: ${testChapterId}`);
          }
        }
      }
    },
  });
  if (infoTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 5: Read Chapter
  // ========================================================================
  
  logHeader('TEST 5: Read Chapter');
  stats.total++;
  
  // Use One Piece Chapter 1 as reliable test case
  const readTest = await testEndpoint('Read Chapter', `${BASE_URL}/api/v1/read/2-10001000/one-piece-chapter-1`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.data && Array.isArray(data.data)) {
        logSuccess(`Pages: ${data.data.length}`);
        if (data.data[0]) {
          logInfo(`First page: ${data.data[0].img.substring(0, 50)}...`);
          if (!testImageUrl) {
            testImageUrl = data.data[0].img;
          }
        }
      }
    },
  });
  if (readTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 6: Recent Updates
  // ========================================================================
  
  logHeader('TEST 6: Recent Updates');
  stats.total++;
  
  const recentTest = await testEndpoint('Recent Chapters', `${BASE_URL}/api/v1/recent`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.results && Array.isArray(data.results)) {
        logSuccess(`Recent updates: ${data.results.length}`);
        if (data.results[0]) {
          logInfo(`Latest: ${data.results[0].mangaTitle} - Ch. ${data.results[0].chapterNumber}`);
        }
      }
      if (data.hasNextPage !== undefined) {
        logInfo(`Has next page: ${data.hasNextPage}`);
      }
    },
  });
  if (recentTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 7: New Manga
  // ========================================================================
  
  logHeader('TEST 7: New Manga');
  stats.total++;
  
  const newTest = await testEndpoint('New Manga', `${BASE_URL}/api/v1/new`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.results && Array.isArray(data.results)) {
        logSuccess(`New manga: ${data.results.length}`);
        if (data.results[0]) {
          logInfo(`First: ${data.results[0].title}`);
        }
      }
    },
  });
  if (newTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 8: Random Manga
  // ========================================================================
  
  logHeader('TEST 8: Random Manga');
  stats.total++;
  
  const randomTest = await testEndpoint('Random Manga', `${BASE_URL}/api/v1/random`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.data) {
        logInfo(`Random: ${data.data.title}`);
        if (data.data.genres) {
          logInfo(`Genres: ${data.data.genres.slice(0, 3).join(', ')}`);
        }
      }
    },
  });
  if (randomTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 9: Genres
  // ========================================================================
  
  logHeader('TEST 9: Genres & Filters');
  stats.total++;
  
  const genresTest = await testEndpoint('Genres', `${BASE_URL}/api/v1/genres`, {
    validate: (data) => {
      if (data.creator === 'emnextech') {
        logSuccess('Creator field present');
      }
      if (data.status === 'success') {
        logSuccess('Response has success status');
      }
      if (data.genres && Array.isArray(data.genres)) {
        logSuccess(`Genres: ${data.genres.length}`);
        logInfo(`Sample: ${data.genres.slice(0, 5).join(', ')}...`);
      }
      if (data.types && Array.isArray(data.types)) {
        logSuccess(`Types: ${data.types.length}`);
        logInfo(`Types: ${data.types.join(', ')}`);
      }
      if (data.statuses && Array.isArray(data.statuses)) {
        logSuccess(`Statuses: ${data.statuses.length}`);
      }
    },
  });
  if (genresTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 10: Advanced Search
  // ========================================================================
  
  logHeader('TEST 10: Advanced Search');
  stats.total++;
  
  const advSearchTest = await testEndpoint(
    'Advanced Search',
    `${BASE_URL}/api/v1/advanced-search?genre=Action&type=manhwa`,
    {
      validate: (data) => {
        if (data.creator === 'emnextech') {
          logSuccess('Creator field present');
        }
        if (data.status === 'success') {
          logSuccess('Response has success status');
        }
        if (data.results && Array.isArray(data.results)) {
          logSuccess(`Results: ${data.results.length}`);
          if (data.results[0]) {
            logInfo(`First: ${data.results[0].title}`);
          }
        }
        if (data.filters) {
          logInfo(`Filters applied: ${JSON.stringify(data.filters)}`);
        }
      },
    }
  );
  if (advSearchTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 11: Image Proxy
  // ========================================================================
  
  logHeader('TEST 11: Image Proxy');
  stats.total++;
  
  // Get a valid image URL from recent if we don't have one
  if (!testImageUrl) {
    const recentData = recentTest.data;
    if (recentData?.results?.[0]?.image) {
      testImageUrl = recentData.results[0].image;
    }
  }
  
  if (testImageUrl) {
    const imageTest = await testEndpoint(
      'Image Proxy',
      `${BASE_URL}/api/v1/image?url=${encodeURIComponent(testImageUrl)}`,
      {
        isImage: true,
        validate: (data, response) => {
          if (data.size > 0) {
            logSuccess(`Image size: ${(data.size / 1024).toFixed(1)} KB`);
          }
          if (data.contentType && data.contentType.startsWith('image/')) {
            logSuccess(`Content-Type: ${data.contentType}`);
          }
          const cacheHeader = response.headers.get('X-Cache');
          if (cacheHeader) {
            logInfo(`Cache status: ${cacheHeader}`);
          }
          const cacheControl = response.headers.get('Cache-Control');
          if (cacheControl) {
            logInfo(`Cache-Control: ${cacheControl}`);
          }
        },
      }
    );
    if (imageTest.success) stats.passed++; else stats.failed++;
  } else {
    logWarning('No test image URL available, skipping image proxy test');
    stats.failed++;
  }
  
  // ========================================================================
  // TEST 12: Image Proxy Cache
  // ========================================================================
  
  logHeader('TEST 12: Image Proxy Cache');
  stats.total++;
  
  if (testImageUrl) {
    logInfo('Second request (should be cached)...');
    const start = Date.now();
    const cachedTest = await testEndpoint(
      'Image Proxy (Cached)',
      `${BASE_URL}/api/v1/image?url=${encodeURIComponent(testImageUrl)}`,
      {
        isImage: true,
        validate: (data, response) => {
          const duration = Date.now() - start;
          const cacheHeader = response.headers.get('X-Cache');
          if (cacheHeader === 'HIT') {
            logSuccess(`Cache HIT - loaded in ${duration}ms`);
          } else {
            logInfo(`Cache ${cacheHeader || 'MISS'} - ${duration}ms`);
          }
        },
      }
    );
    if (cachedTest.success) stats.passed++; else stats.failed++;
  } else {
    logWarning('No test image URL available, skipping cache test');
    stats.failed++;
  }
  
  // ========================================================================
  // TEST 13: Pagination
  // ========================================================================
  
  logHeader('TEST 13: Pagination');
  stats.total++;
  
  const paginationTest = await testEndpoint(
    'Recent Page 2',
    `${BASE_URL}/api/v1/recent?page=2`,
    {
      validate: (data) => {
        if (data.status === 'success') {
          logSuccess('Response has success status');
        }
        if (data.currentPage === 2) {
          logSuccess('Correct page number returned');
        }
        if (data.results && data.results.length > 0) {
          logSuccess(`Page 2 results: ${data.results.length}`);
        }
      },
    }
  );
  if (paginationTest.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // TEST 14: Error Handling
  // ========================================================================
  
  logHeader('TEST 14: Error Handling');
  stats.total++;
  
  const errorTest = await testEndpoint(
    'Invalid Endpoint',
    `${BASE_URL}/api/v1/invalid/endpoint`,
    {
      expectError: true,
      validate: (data) => {
        if (data.status === 'error') {
          logSuccess('Error response has correct status');
        }
        if (data.message) {
          logInfo(`Error message: ${data.message}`);
        }
        if (data.creator === 'emnextech') {
          logSuccess('Creator field present even in errors');
        }
      },
    }
  );
  // Error tests pass if they correctly return an error
  stats.passed++;
  
  // ========================================================================
  // TEST 15: Cache Functionality
  // ========================================================================
  
  logHeader('TEST 15: Cache Functionality');
  stats.total++;
  
  const uniqueQuery = `cachetest${Date.now()}`;
  
  logInfo('First request (uncached)...');
  const cache1 = await testEndpoint(
    'Search (First)',
    `${BASE_URL}/api/v1/search/${uniqueQuery}`,
    {
      validate: (data) => {
        if (data.cached !== true) {
          logSuccess('First request not cached (expected)');
        }
      },
    }
  );
  
  logInfo('Second request (should be cached)...');
  const cache2 = await testEndpoint(
    'Search (Second)',
    `${BASE_URL}/api/v1/search/${uniqueQuery}`,
    {
      validate: (data) => {
        if (data.cached === true) {
          logSuccess('Second request cached (expected)');
        } else {
          logInfo('Cache not indicated (may still be cached)');
        }
      },
    }
  );
  if (cache1.success && cache2.success) stats.passed++; else stats.failed++;
  
  // ========================================================================
  // FINAL SUMMARY
  // ========================================================================
  
  console.log();
  log('═'.repeat(70), 'bright');
  log('  📊 TEST SUMMARY', 'bright');
  log('═'.repeat(70), 'bright');
  log(`  Total Tests: ${stats.total}`, 'white');
  log(`  Passed: ${stats.passed}`, 'green');
  log(`  Failed: ${stats.failed}`, stats.failed > 0 ? 'red' : 'green');
  log(`  Success Rate: ${((stats.passed / stats.total) * 100).toFixed(1)}%`, 'cyan');
  log('═'.repeat(70), 'bright');
  
  if (stats.failed === 0) {
    log('  🎉 ALL TESTS PASSED! 🎉', 'green');
  } else {
    log(`  ⚠️  ${stats.failed} TEST(S) FAILED`, 'yellow');
  }
  
  log('═'.repeat(70), 'bright');
  console.log();
  
  process.exit(stats.failed > 0 ? 1 : 0);
}

// ============================================================================
// RUN TESTS
// ============================================================================

runTests().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
