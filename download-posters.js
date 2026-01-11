// Script to download manga poster images from the API
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const API_BASE = 'http://127.0.0.1:8788';
const OUTPUT_DIR = path.join(__dirname, 'manga images');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Created folder: ${OUTPUT_DIR}`);
}

// Fetch JSON from API
async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Download image from URL
async function downloadImage(imageUrl, filename) {
  return new Promise((resolve, reject) => {
    // Use the image proxy endpoint for better compatibility
    const proxyUrl = `${API_BASE}/api/v1/image?url=${encodeURIComponent(imageUrl)}`;
    
    http.get(proxyUrl, (res) => {
      if (res.statusCode === 200) {
        const filePath = path.join(OUTPUT_DIR, filename);
        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filePath);
        });
        fileStream.on('error', reject);
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Sanitize filename
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

async function main() {
  console.log('🎨 Manga Poster Downloader');
  console.log('==========================\n');

  try {
    // Fetch home data (includes trending manga)
    console.log('📡 Fetching home data...');
    const homeData = await fetchJson(`${API_BASE}/api/v1/home`);
    
    // Fetch new manga
    console.log('📡 Fetching new manga...');
    const newMangaData = await fetchJson(`${API_BASE}/api/v1/new`);

    const allManga = [];

    // Add trending manga from home
    if (homeData.trending) {
      console.log(`\n🔥 Found ${homeData.trending.length} trending manga`);
      homeData.trending.forEach(manga => {
        if (manga.image) {
          allManga.push({
            title: manga.title,
            image: manga.image,
            category: 'trending'
          });
        }
      });
    }

    // Add featured manga from home
    if (homeData.featured) {
      console.log(`⭐ Found ${homeData.featured.length} featured manga`);
      homeData.featured.slice(0, 10).forEach(manga => {
        if (manga.image) {
          allManga.push({
            title: manga.title,
            image: manga.image,
            category: 'featured'
          });
        }
      });
    }

    // Add new manga
    if (newMangaData.results) {
      console.log(`🆕 Found ${newMangaData.results.length} new manga`);
      newMangaData.results.slice(0, 10).forEach(manga => {
        if (manga.image) {
          allManga.push({
            title: manga.title,
            image: manga.image,
            category: 'new'
          });
        }
      });
    }

    // Remove duplicates by title
    const uniqueManga = [];
    const seen = new Set();
    for (const manga of allManga) {
      if (!seen.has(manga.title)) {
        seen.add(manga.title);
        uniqueManga.push(manga);
      }
    }

    console.log(`\n📥 Downloading ${uniqueManga.length} unique posters...\n`);

    let downloaded = 0;
    let failed = 0;

    for (const manga of uniqueManga) {
      const safeName = sanitizeFilename(manga.title);
      const filename = `${manga.category}_${safeName}.jpg`;
      
      try {
        process.stdout.write(`  Downloading: ${manga.title.substring(0, 40)}... `);
        await downloadImage(manga.image, filename);
        console.log('✅');
        downloaded++;
      } catch (error) {
        console.log(`❌ (${error.message})`);
        failed++;
      }
    }

    console.log('\n==========================');
    console.log(`✅ Downloaded: ${downloaded} images`);
    console.log(`❌ Failed: ${failed} images`);
    console.log(`📁 Saved to: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
