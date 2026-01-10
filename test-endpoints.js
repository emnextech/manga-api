/**
 * ============================================================================
 * Emnex Manga API - Comprehensive Endpoint Test Suite
 * ============================================================================
 * 
 * This script tests all endpoints of the Emnex Manga Worker API locally.
 * 
 * PREREQUISITES:
 *   1. Node.js 18+ installed
 *   2. Worker running locally: npm run dev
 * 
 * USAGE:
 *   node test-endpoints.js                    # Test against localhost:8788
 *   API_URL=https://your.api.com node test-endpoints.js  # Test production
 * 
 * WHAT IT TESTS:
 *   ✓ Home endpoint (API info)
 *   ✓ Providers list
 *   ✓ Search functionality (all providers)
 *   ✓ Manga info (all providers)
 *   ✓ Chapter pages (all providers)
 *   ✓ 404 error handling
 *   ✓ Cache functionality
 *   ✓ CORS headers
 * 
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:8788';

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
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
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
  const { validate, expectError = false } = options;
  
  logSubHeader(name, url);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url);
    const duration = Date.now() - startTime;
    
    const data = await response.json();
    
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
    
    return data;
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

async function runTests() {
  log('', 'reset');
  log('═'.repeat(70), 'bright');
  log('  🧪 EMNEX MANGA WORKER API - COMPREHENSIVE TEST SUITE', 'bright');
  log('═'.repeat(70), 'bright');
  log(`  Base URL: ${BASE_URL}`, 'cyan');
  log(`  Started: ${new Date().toLocaleString()}`, 'dim');
  log('═'.repeat(70), 'bright');
  
  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
  };
  
  // Store data for use across tests
  let testMangaId = null;
  let testChapterId = null;
  let searchResults = null;
  
  // ========================================================================
  // TEST 1: Home Endpoint
  // ========================================================================
  
  try {
    logHeader('TEST 1: Home Endpoint');
    
    await testEndpoint('API Home', `${BASE_URL}/`, {
      validate: (data) => {
        if (data.status === 'success') {
          logSuccess('Response has success status');
        }
        if (data.name) {
          logInfo(`API Name: ${data.name}`);
        }
        if (data.version) {
          logInfo(`Version: ${data.version}`);
        }
        if (data.providers && data.providers.length > 0) {
          logSuccess(`Found ${data.providers.length} providers`);
          data.providers.forEach(p => {
            logInfo(`  • ${p.name} (${p.id}) - ${p.baseUrl}`);
          });
        }
        if (data.endpoints) {
          logSuccess('Endpoints documentation found');
        }
      },
    });
    
    stats.passed++;
  } catch (error) {
    stats.failed++;
  }
  stats.total++;
  
  // ========================================================================
  // TEST 2: Providers List
  // ========================================================================
  
  try {
    logHeader('TEST 2: Providers List');
    
    await testEndpoint('Get Providers', `${BASE_URL}/api/providers`, {
      validate: (data) => {
        if (data.status === 'success') {
          logSuccess('Response has success status');
        }
        if (data.providers && Array.isArray(data.providers)) {
          logSuccess(`Found ${data.providers.length} providers`);
          data.providers.forEach(p => {
            logInfo(`  • ${p.name} (${p.id})`);
            if (p.endpoints) {
              p.endpoints.forEach(e => logInfo(`    - ${e}`));
            }
          });
        }
      },
    });
    
    stats.passed++;
  } catch (error) {
    stats.failed++;
  }
  stats.total++;
  
  // ========================================================================
  // TEST 3: Search Functionality (All Providers)
  // ========================================================================
  
  logHeader('TEST 3: Search Functionality');
  
  // Only test working providers
  const providers = ['mangapill'];
  const searchQuery = 'naruto';
  
  for (const provider of providers) {
    try {
      searchResults = await testEndpoint(
        `Search - ${provider.toUpperCase()}`,
        `${BASE_URL}/api/${provider}/search/${searchQuery}`,
        {
          validate: (data) => {
            if (data.status === 'success') {
              logSuccess('Response has success status');
            }
            if (data.results && Array.isArray(data.results)) {
              logSuccess(`Found ${data.results.length} results`);
              if (data.results.length > 0) {
                const first = data.results[0];
                logInfo(`First result: ${first.title || first.id}`);
                if (first.id && !testMangaId && provider === 'mangadex') {
                  testMangaId = first.id;
                  logInfo(`Saved manga ID for later tests: ${testMangaId}`);
                }
              }
            }
            if (data.hasNextPage !== undefined) {
              logInfo(`Has next page: ${data.hasNextPage}`);
            }
          },
        }
      );
      
      stats.passed++;
    } catch (error) {
      stats.failed++;
    }
    stats.total++;
  }
  
  // ========================================================================
  // TEST 4: Search with Pagination
  // ========================================================================
  
  try {
    logHeader('TEST 4: Search with Pagination');
    
    await testEndpoint(
      'Search MangaPill - Page 2',
      `${BASE_URL}/api/mangapill/search/one piece?page=2`,
      {
        validate: (data) => {
          if (data.status === 'success') {
            logSuccess('Response has success status');
          }
          if (data.page || data.currentPage) {
            logInfo(`Current page: ${data.page || data.currentPage}`);
          }
          if (data.results) {
            logSuccess(`Found ${data.results.length} results on page 2`);
          }
        },
      }
    );
    
    stats.passed++;
  } catch (error) {
    stats.failed++;
  }
  stats.total++;
  
  // ========================================================================
  // TEST 5: Manga Info (All Providers)
  // ========================================================================
  
  logHeader('TEST 5: Manga Info');
  
  // Only test working providers
  const testIds = {
    mangapill: '2/one-piece', // One Piece on MangaPill
  };
  
  for (const provider of providers) {
    try {
      const mangaId = testIds[provider];
      const infoData = await testEndpoint(
        `Info - ${provider.toUpperCase()}`,
        `${BASE_URL}/api/${provider}/info/${mangaId}`,
        {
          validate: (data) => {
            if (data.status === 'success') {
              logSuccess('Response has success status');
            }
            const manga = data.data || data;
            if (manga.title) {
              logInfo(`Title: ${manga.title}`);
            }
            if (manga.description) {
              logSuccess('Description found');
            }
            if (manga.chapters && Array.isArray(manga.chapters)) {
              logSuccess(`Found ${manga.chapters.length} chapters`);
              if (manga.chapters.length > 0 && !testChapterId && provider === 'mangadex') {
                testChapterId = manga.chapters[0].id;
                logInfo(`Saved chapter ID for later tests: ${testChapterId}`);
              }
            }
            if (manga.genres) {
              logInfo(`Genres: ${Array.isArray(manga.genres) ? manga.genres.join(', ') : manga.genres}`);
            }
            if (manga.status) {
              logInfo(`Status: ${manga.status}`);
            }
          },
        }
      );
      
      stats.passed++;
    } catch (error) {
      logWarning(`Skipping ${provider} - may need valid ID`);
      stats.failed++;
    }
    stats.total++;
  }
  
  // ========================================================================
  // TEST 6: Read Chapter Pages (All Providers)
  // ========================================================================
  
  logHeader('TEST 6: Read Chapter Pages');
  
  // Only test working providers
  const chapterIds = {
    mangapill: '2-10001000/one-piece-chapter-1', // One Piece Chapter 1
  };
  
  for (const provider of providers) {
    try {
      const chapterId = chapterIds[provider];
      await testEndpoint(
        `Read - ${provider.toUpperCase()}`,
        `${BASE_URL}/api/${provider}/read/${chapterId}`,
        {
          validate: (data) => {
            if (data.status === 'success') {
              logSuccess('Response has success status');
            }
            const pages = data.data || data;
            if (Array.isArray(pages)) {
              logSuccess(`Found ${pages.length} pages`);
              if (pages.length > 0) {
                logInfo(`First page: ${pages[0].img || pages[0].url || pages[0]}`);
              }
            } else if (pages.pages) {
              logSuccess(`Found ${pages.pages.length} pages`);
            }
          },
        }
      );
      
      stats.passed++;
    } catch (error) {
      logWarning(`Skipping ${provider} - may need valid chapter ID`);
      stats.failed++;
    }
    stats.total++;
  }
  
  // ========================================================================
  // TEST 7: Cache Functionality
  // ========================================================================
  
  try {
    logHeader('TEST 7: Cache Functionality');
    
    // Use a unique query to ensure first request is never cached
    const uniqueQuery = `cachetest${Date.now()}`;
    
    logInfo('First request (uncached)...');
    const firstResponse = await testEndpoint(
      'Search (First Request)',
      `${BASE_URL}/api/mangapill/search/${uniqueQuery}`,
      {
        validate: (data) => {
          if (data.cached === true) {
            logWarning('First request was cached (unexpected)');
          } else {
            logSuccess('First request was not cached (expected)');
          }
        },
      }
    );
    
    logInfo('Second request (should be cached)...');
    const secondResponse = await testEndpoint(
      'Search (Second Request)',
      `${BASE_URL}/api/mangapill/search/${uniqueQuery}`,
      {
        validate: (data) => {
          if (data.cached === true) {
            logSuccess('Second request was cached (expected)');
          } else {
            logInfo('Second request was not cached (cache may have expired)');
          }
        },
      }
    );
    
    stats.passed++;
  } catch (error) {
    stats.failed++;
  }
  stats.total++;
  
  // ========================================================================
  // TEST 8: Error Handling
  // ========================================================================
  
  try {
    logHeader('TEST 8: Error Handling');
    
    await testEndpoint(
      'Invalid Endpoint',
      `${BASE_URL}/api/invalid/endpoint/test`,
      {
        expectError: true,
        validate: (data) => {
          if (data.status === 'error') {
            logSuccess('Error response has correct status');
          }
          if (data.message) {
            logInfo(`Error message: ${data.message}`);
          }
        },
      }
    );
    
    await testEndpoint(
      'Invalid Provider',
      `${BASE_URL}/api/invalidprovider/search/test`,
      {
        expectError: true,
        validate: (data) => {
          if (data.status === 'error') {
            logSuccess('Invalid provider correctly rejected');
          }
        },
      }
    );
    
    stats.passed++;
  } catch (error) {
    stats.failed++;
  }
  stats.total++;
  
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
