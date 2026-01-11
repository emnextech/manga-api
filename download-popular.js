// Script to download POPULAR manga poster images
const fs = require('fs');
const path = require('path');
const http = require('http');

const API_BASE = 'http://127.0.0.1:8788';
const OUTPUT_DIR = path.join(__dirname, 'manga images');

// Popular manga titles to search for
const POPULAR_MANGA = [
  'One Piece',
  'Naruto',
  'Dragon Ball',
  'Attack on Titan',
  'Demon Slayer',
  'Jujutsu Kaisen',
  'My Hero Academia',
  'Death Note',
  'Chainsaw Man',
  'Bleach',
  'Hunter x Hunter',
  'Tokyo Ghoul',
  'Fullmetal Alchemist',
  'Spy x Family',
  'Solo Leveling',
  'One Punch Man',
  'Black Clover',
  'Vinland Saga',
  'Mob Psycho 100',
  'Kaiju No. 8'
];

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Fetch JSON from API
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON`));
        }
      });
    }).on('error', reject);
  });
}

// Download image
function downloadImage(imageUrl, filename) {
  return new Promise((resolve, reject) => {
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
    .substring(0, 80);
}

// Add delay between requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔥 Popular Manga Poster Downloader');
  console.log('===================================\n');

  let downloaded = 0;
  let failed = 0;

  for (const title of POPULAR_MANGA) {
    try {
      process.stdout.write(`🔍 Searching: ${title}... `);
      
      const searchUrl = `${API_BASE}/api/v1/search/${encodeURIComponent(title)}`;
      const data = await fetchJson(searchUrl);
      
      if (data.results && data.results.length > 0) {
        // Get the first (most relevant) result
        const manga = data.results[0];
        
        if (manga.image) {
          const safeName = sanitizeFilename(manga.title);
          const filename = `popular_${safeName}.jpg`;
          
          process.stdout.write(`📥 Downloading... `);
          await downloadImage(manga.image, filename);
          console.log(`✅ ${manga.title}`);
          downloaded++;
        } else {
          console.log('❌ No image');
          failed++;
        }
      } else {
        console.log('❌ Not found');
        failed++;
      }
      
      // Small delay to be nice to the API
      await delay(200);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n===================================');
  console.log(`✅ Downloaded: ${downloaded} popular manga posters`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📁 Saved to: ${OUTPUT_DIR}`);
}

main();
