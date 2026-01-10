/**
 * Test individual manga providers to see which ones work
 * Run this before implementing them in the worker
 */

const DEFAULT_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Cache-Control': 'no-cache',
};

console.log('🧪 Testing Manga Providers...\n');

// ============================================
// Test MangaDex API
// ============================================

async function testMangaDex() {
  console.log('━'.repeat(70));
  console.log('📘 Testing MangaDex (API-based)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://api.mangadex.org/manga?title=naruto&limit=5';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const text = await response.text();
    console.log(`  Response length: ${text.length} bytes`);
    console.log(`  First 200 chars: ${text.substring(0, 200)}`);
    
    if (response.ok && text.includes('"result"')) {
      const data = JSON.parse(text);
      console.log(`  ✅ SUCCESS - Found ${data.data?.length || 0} results`);
      if (data.data && data.data.length > 0) {
        console.log(`  First manga: ${data.data[0].attributes.title.en || Object.values(data.data[0].attributes.title)[0]}`);
      }
      return true;
    } else {
      console.log(`  ❌ FAILED - ${text.substring(0, 100)}`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Test MangaPill
// ============================================

async function testMangaPill() {
  console.log('\n━'.repeat(70));
  console.log('📕 Testing MangaPill (Web Scraping)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://mangapill.com/search?q=naruto';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const html = await response.text();
    console.log(`  Response length: ${html.length} bytes`);
    console.log(`  First 200 chars: ${html.substring(0, 200)}`);
    
    // Check for Cloudflare protection
    if (html.includes('Cloudflare') || html.includes('cf-browser-verification')) {
      console.log(`  ❌ BLOCKED - Cloudflare protection detected`);
      return false;
    }
    
    // Check for manga results
    if (html.includes('/manga/') && response.ok) {
      const mangaCount = (html.match(/\/manga\//g) || []).length;
      console.log(`  ✅ SUCCESS - Found ~${mangaCount} manga links`);
      return true;
    } else {
      console.log(`  ❌ FAILED - No manga results found`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Test MangaHere
// ============================================

async function testMangaHere() {
  console.log('\n━'.repeat(70));
  console.log('📗 Testing MangaHere (Web Scraping)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://www.mangahere.cc/search?title=naruto';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const html = await response.text();
    console.log(`  Response length: ${html.length} bytes`);
    console.log(`  First 200 chars: ${html.substring(0, 200)}`);
    
    // Check for Cloudflare protection
    if (html.includes('Cloudflare') || html.includes('cf-browser-verification')) {
      console.log(`  ❌ BLOCKED - Cloudflare protection detected`);
      return false;
    }
    
    if (html.includes('manga') && response.ok) {
      console.log(`  ✅ SUCCESS - Page loaded`);
      return true;
    } else {
      console.log(`  ❌ FAILED`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Test MangaReader
// ============================================

async function testMangaReader() {
  console.log('\n━'.repeat(70));
  console.log('📙 Testing MangaReader (Web Scraping)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://mangareader.to/search?keyword=naruto';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const html = await response.text();
    console.log(`  Response length: ${html.length} bytes`);
    console.log(`  First 200 chars: ${html.substring(0, 200)}`);
    
    // Check for Cloudflare protection
    if (html.includes('Cloudflare') || html.includes('cf-browser-verification')) {
      console.log(`  ❌ BLOCKED - Cloudflare protection detected`);
      return false;
    }
    
    if (html.includes('manga') && response.ok) {
      console.log(`  ✅ SUCCESS - Page loaded`);
      return true;
    } else {
      console.log(`  ❌ FAILED`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Test Mangakakalot (Alternative)
// ============================================

async function testMangakakalot() {
  console.log('\n━'.repeat(70));
  console.log('📓 Testing Mangakakalot (Alternative - Web Scraping)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://mangakakalot.com/search/story/naruto';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const html = await response.text();
    console.log(`  Response length: ${html.length} bytes`);
    console.log(`  First 200 chars: ${html.substring(0, 200)}`);
    
    // Check for Cloudflare protection
    if (html.includes('Cloudflare') || html.includes('cf-browser-verification')) {
      console.log(`  ❌ BLOCKED - Cloudflare protection detected`);
      return false;
    }
    
    if (html.includes('story_item') && response.ok) {
      const mangaCount = (html.match(/story_item/g) || []).length;
      console.log(`  ✅ SUCCESS - Found ~${mangaCount} manga items`);
      return true;
    } else {
      console.log(`  ❌ FAILED - No manga results found`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Test MangaDex.org Direct (Alternative)
// ============================================

async function testMangaDexDirect() {
  console.log('\n━'.repeat(70));
  console.log('📘 Testing MangaDex.org Website (Alternative - Web Scraping)');
  console.log('━'.repeat(70));
  
  try {
    const url = 'https://mangadex.org/titles?q=naruto';
    console.log(`  URL: ${url}`);
    
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    const html = await response.text();
    console.log(`  Response length: ${html.length} bytes`);
    console.log(`  First 200 chars: ${html.substring(0, 200)}`);
    
    if (html.includes('title') && response.ok) {
      console.log(`  ✅ SUCCESS - Page loaded (uses client-side rendering)`);
      console.log(`  ⚠️  Note: Requires API or client-side rendering support`);
      return false; // Can't scrape client-side rendered content
    } else {
      console.log(`  ❌ FAILED`);
      return false;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}`);
    return false;
  }
}

// ============================================
// Run All Tests
// ============================================

async function runAllTests() {
  const results = {
    mangadex: await testMangaDex(),
    mangapill: await testMangaPill(),
    mangahere: await testMangaHere(),
    mangareader: await testMangaReader(),
    mangakakalot: await testMangakakalot(),
    mangadexDirect: await testMangaDexDirect(),
  };
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));
  
  const working = Object.entries(results).filter(([_, status]) => status);
  const failed = Object.entries(results).filter(([_, status]) => !status);
  
  console.log(`\n✅ WORKING PROVIDERS (${working.length}):`);
  working.forEach(([name]) => {
    console.log(`   • ${name}`);
  });
  
  console.log(`\n❌ FAILED PROVIDERS (${failed.length}):`);
  failed.forEach(([name]) => {
    console.log(`   • ${name}`);
  });
  
  console.log('\n' + '═'.repeat(70));
  console.log('💡 RECOMMENDATION:');
  console.log('═'.repeat(70));
  
  if (working.length === 0) {
    console.log('  ⚠️  No providers are working. Consider:');
    console.log('     1. Using a proxy service');
    console.log('     2. Implementing Cloudflare bypass');
    console.log('     3. Using the Consumet extensions library directly');
  } else {
    console.log(`  Build the worker using these ${working.length} working provider(s):`);
    working.forEach(([name]) => {
      console.log(`     • ${name}`);
    });
  }
  
  console.log('═'.repeat(70));
}

// Run the tests
runAllTests().catch(console.error);
