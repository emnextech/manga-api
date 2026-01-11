// Emnex Tech Manga Worker - Cloudflare Worker
// Scrapes manga content from multiple providers using @consumet/extensions

// ============================================
// CONFIGURATION
// ============================================

const CACHE_DURATIONS = {
  search: 300000,      // 5 minutes
  info: 1800000,       // 30 minutes
  chapters: 900000,    // 15 minutes
  pages: 3600000,      // 1 hour
  recent: 180000,      // 3 minutes (frequently updated)
  new: 600000,         // 10 minutes
};

// Available genres on MangaPill
const MANGAPILL_GENRES = [
  'Action', 'Adventure', 'Cars', 'Comedy', 'Dementia', 'Demons', 'Doujinshi',
  'Drama', 'Ecchi', 'Fantasy', 'Game', 'Gender Bender', 'Harem', 'Historical',
  'Horror', 'Isekai', 'Josei', 'Kids', 'Magic', 'Martial Arts', 'Mecha',
  'Military', 'Music', 'Mystery', 'Parody', 'Police', 'Psychological',
  'Romance', 'Samurai', 'School', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shoujo Ai',
  'Shounen', 'Shounen Ai', 'Slice of Life', 'Space', 'Sports', 'Super Power',
  'Supernatural', 'Thriller', 'Tragedy', 'Vampire', 'Yaoi', 'Yuri'
];

// Available types on MangaPill
const MANGAPILL_TYPES = ['manga', 'novel', 'one-shot', 'doujinshi', 'manhwa', 'manhua'];

// Available statuses on MangaPill
const MANGAPILL_STATUSES = ['publishing', 'finished', 'on hiatus', 'discontinued'];

// In-memory caches
const searchCache = new Map();
const infoCache = new Map();
const pagesCache = new Map();
const recentCache = new Map();
const newMangaCache = new Map();
const homeCache = new Map();



// ============================================
// PROVIDERS CONFIGURATION
// ============================================

const PROVIDERS = {
  MANGADEX: {
    name: 'MangaDex',
    baseUrl: 'https://mangadex.org',
    id: 'mangadex',
    status: 'active',
  },
  MANGAPILL: {
    name: 'MangaPill',
    baseUrl: 'https://mangapill.com',
    id: 'mangapill',
    status: 'active',
  },
  // Commented out until implemented
  // MANGAHERE: {
  //   name: 'MangaHere',
  //   baseUrl: 'https://www.mangahere.cc',
  //   id: 'mangahere',
  //   status: 'unavailable',
  // },
  // MANGAREADER: {
  //   name: 'MangaReader',
  //   baseUrl: 'https://mangareader.to',
  //   id: 'mangareader',
  //   status: 'unavailable',
  // },
};

// Default headers for requests
const DEFAULT_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Cache-Control': 'no-cache',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function corsHeaders(env, requestOrigin = null) {
  let allowedOrigin = env?.ALLOWED_ORIGIN || '*';
  
  // If multiple origins are configured (comma-separated), check if request origin is allowed
  if (allowedOrigin.includes(',') && requestOrigin) {
    const allowedOrigins = allowedOrigin.split(',').map(o => o.trim());
    if (allowedOrigins.includes(requestOrigin)) {
      allowedOrigin = requestOrigin;
    } else {
      allowedOrigin = allowedOrigins[0]; // Default to first allowed origin
    }
  }
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Worker-Auth, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, env = {}, request = null) {
  // Always add creator field at the beginning
  const responseData = {
    creator: 'emnextech',
    ...data,
  };
  const requestOrigin = request?.headers?.get('Origin');
  return new Response(JSON.stringify(responseData), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, requestOrigin),
    },
  });
}

function errorResponse(message, status = 500, env = {}, request = null) {
  return jsonResponse({
    status: 'error',
    message,
  }, status, env, request);
}

// HTML Response helper
function htmlResponse(html, status = 200, env = {}, request = null) {
  const requestOrigin = request?.headers?.get('Origin');
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(env, requestOrigin),
    },
  });
}

function validateRequest(request, env, allowQueryToken = false) {
  if (!env.SECRET_TOKEN) {
    return true;
  }

  const authHeader = request.headers.get('X-Worker-Auth');
  if (authHeader === env.SECRET_TOKEN) {
    return true;
  }

  if (allowQueryToken) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken === env.SECRET_TOKEN) {
      return true;
    }
  }

  return false;
}

// ============================================
// HTML PARSING UTILITIES
// ============================================

function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#8217;': "'",
    '&#8220;': '"',
    '&#8221;': '"',
    '&#8211;': '-',
    '&#8212;': '—',
  };
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

function extractAllMatches(html, regex) {
  const matches = [];
  let match;
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  while ((match = globalRegex.exec(html)) !== null) {
    matches.push(match);
  }
  return matches;
}

// ============================================
// MANGAPILL PROVIDER (Direct Scraping)
// ============================================

async function mangapillSearch(query, page = 1) {
  const url = `https://mangapill.com/search?q=${encodeURIComponent(query)}`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const results = [];
    
    // Extract manga from search results
    const mangaPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    
    let match;
    while ((match = mangaPattern.exec(html)) !== null) {
      const id = match[1];
      const image = match[2].startsWith('http') ? match[2] : `https://mangapill.com${match[2]}`;
      const title = decodeHtmlEntities(match[3].trim());
      
      results.push({
        id,
        title,
        image,
        url: `https://mangapill.com/manga/${id}`,
        provider: 'MangaPill',
      });
    }
    
    return {
      currentPage: page,
      hasNextPage: false,
      results,
    };
  } catch (error) {
    console.error('MangaPill search error:', error);
    throw new Error(`Search failed: ${error.message}`);
  }
}

async function mangapillInfo(mangaId) {
  const url = `https://mangapill.com/manga/${mangaId}`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    // Extract title - look for h1 with manga title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : mangaId;
    
    // Extract image - look for cover image with data-src or src
    const imageMatch = html.match(/<img[^>]*src="(https:\/\/cdn[^"]+)"[^>]*\/>/i);
    const image = imageMatch ? imageMatch[1] : null;
    
    // Extract description - look for paragraph with story summary
    const descMatch = html.match(/<p[^>]*class="[^"]*text--secondary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripHtmlTags(descMatch[1]).trim() : '';
    
    // Extract genres
    const genreMatches = extractAllMatches(html, /<a[^>]*href="\/search\?genre=[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres = genreMatches.map(m => decodeHtmlEntities(m[1]));
    
    // Extract status - look in info section
    const statusMatch = html.match(/Status[^<]*<[^>]*>([^<]+)<\/a>/i) ||
                        html.match(/Ongoing|Completed|Hiatus/i);
    const status = statusMatch ? (statusMatch[1] || statusMatch[0]).trim().toUpperCase() : 'UNKNOWN';
    
    // Extract chapters - pattern: <a class="..." href="/chapters/ID/SLUG" title="...">ChapterTitle</a>
    const chapters = [];
    const chapterPattern = /<a[^>]*href="\/chapters\/([^\/"]+\/[^"]+)"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
    let chapterMatch;
    while ((chapterMatch = chapterPattern.exec(html)) !== null) {
      const chapterId = chapterMatch[1];
      const chapterTitle = chapterMatch[2].trim() || chapterMatch[3].trim();
      const chapterText = chapterMatch[3].trim();
      
      // Extract chapter number from text like "Chapter 1170"
      const numMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapterNumber = numMatch ? numMatch[1] : 'Unknown';
      
      chapters.push({
        id: chapterId,
        title: chapterTitle || chapterText,
        chapterNumber: chapterNumber,
      });
    }
    
    return {
      id: mangaId,
      title,
      url,
      image,
      description: decodeHtmlEntities(description),
      genres,
      status,
      chapters,
      totalChapters: chapters.length,
      provider: 'MangaPill',
    };
  } catch (error) {
    console.error('MangaPill info error:', error);
    throw new Error(`Failed to fetch manga info: ${error.message}`);
  }
}

async function mangapillRead(chapterId) {
  const url = `https://mangapill.com/chapters/${chapterId}`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const pages = [];
    
    // Extract page images - pattern: <img class="js-page" data-src="URL" alt="...">
    const pagePattern = /<img[^>]*class="js-page"[^>]*data-src="([^"]+)"/gi;
    let match;
    while ((match = pagePattern.exec(html)) !== null) {
      const img = match[1];
      pages.push({
        page: pages.length + 1,
        img,
      });
    }
    
    return pages;
  } catch (error) {
    console.error('MangaPill read error:', error);
    throw new Error(`Failed to fetch chapter pages: ${error.message}`);
  }
}

// Advanced search with filters (genre, type, status)
async function mangapillAdvancedSearch(options = {}) {
  const { query = '', genre = '', type = '', status = '', page = 1 } = options;
  
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (genre) params.append('genre', genre);
  if (type) params.append('type', type);
  if (status) params.append('status', status);
  if (page > 1) params.append('page', page);
  
  const url = `https://mangapill.com/search?${params.toString()}`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const results = [];
    
    // Extract manga from search results
    const mangaPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    
    let match;
    while ((match = mangaPattern.exec(html)) !== null) {
      const id = match[1];
      const image = match[2].startsWith('http') ? match[2] : `https://mangapill.com${match[2]}`;
      const title = decodeHtmlEntities(match[3].trim());
      
      results.push({
        id,
        title,
        image,
        url: `https://mangapill.com/manga/${id}`,
        provider: 'MangaPill',
      });
    }
    
    // Check for next page
    const hasNextPage = html.includes(`page=${page + 1}"`);
    
    return {
      currentPage: page,
      hasNextPage,
      filters: { query, genre, type, status },
      results,
    };
  } catch (error) {
    console.error('MangaPill advanced search error:', error);
    throw new Error(`Advanced search failed: ${error.message}`);
  }
}

// Get recent chapter updates
async function mangapillRecentChapters(page = 1) {
  const url = page > 1 
    ? `https://mangapill.com/chapters?page=${page}`
    : `https://mangapill.com/chapters`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const results = [];
    
    // Extract chapter links first
    const chapterLinks = [];
    const chapterLinkRegex = /<a\s+href="\/chapters\/([^"]+)"[^>]*class="relative block"/gi;
    let linkMatch;
    while ((linkMatch = chapterLinkRegex.exec(html)) !== null) {
      chapterLinks.push(linkMatch[1]);
    }
    
    // Extract images with data-src
    const images = [];
    const imageRegex = /<img\s+data-src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let imgMatch;
    while ((imgMatch = imageRegex.exec(html)) !== null) {
      images.push({ url: imgMatch[1], alt: imgMatch[2] });
    }
    
    // Extract manga links - structure: <a href="/manga/ID" class="...text-secondary"><div>Title</div>
    const mangaLinks = [];
    const mangaLinkRegex = /<a\s+href="\/manga\/([^"]+)"[^>]*class="[^"]*text-secondary[^"]*">\s*<div[^>]*>([^<]+)<\/div>/gi;
    let mangaMatch;
    while ((mangaMatch = mangaLinkRegex.exec(html)) !== null) {
      mangaLinks.push({ id: mangaMatch[1], title: mangaMatch[2] });
    }
    
    // Combine the data
    for (let i = 0; i < Math.min(chapterLinks.length, images.length, mangaLinks.length); i++) {
      const chapterId = chapterLinks[i];
      const image = images[i].url;
      const chapterTitle = decodeHtmlEntities(images[i].alt);
      const mangaId = mangaLinks[i].id;
      const mangaTitle = decodeHtmlEntities(mangaLinks[i].title);
      
      // Extract chapter number from the alt text (e.g., "Red Blue Chapter 177")
      const numMatch = chapterTitle.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapterNumber = numMatch ? numMatch[1] : 'Unknown';
      
      results.push({
        chapterId,
        chapterTitle,
        chapterNumber,
        mangaId,
        mangaTitle,
        image,
        chapterUrl: `https://mangapill.com/chapters/${chapterId}`,
        mangaUrl: `https://mangapill.com/manga/${mangaId}`,
        provider: 'MangaPill',
      });
    }
    
    // Check for next page
    const hasNextPage = html.includes(`page=${page + 1}"`);
    
    return {
      currentPage: page,
      hasNextPage,
      results,
    };
  } catch (error) {
    console.error('MangaPill recent chapters error:', error);
    throw new Error(`Failed to fetch recent chapters: ${error.message}`);
  }
}

// Get newly added manga
async function mangapillNewManga(page = 1) {
  const url = page > 1 
    ? `https://mangapill.com/mangas/new?page=${page}`
    : `https://mangapill.com/mangas/new`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const results = [];
    
    // Extract manga links with relative block class
    const mangaIds = [];
    const mangaIdRegex = /<a\s+href="\/manga\/([^"]+)"[^>]*class="relative block"/gi;
    let idMatch;
    while ((idMatch = mangaIdRegex.exec(html)) !== null) {
      mangaIds.push(idMatch[1]);
    }
    
    // Extract images with data-src
    const images = [];
    const imageRegex = /<img\s+data-src="([^"]+)"[^>]*alt="([^"]+)"/gi;
    let imgMatch;
    while ((imgMatch = imageRegex.exec(html)) !== null) {
      images.push({ url: imgMatch[1], alt: imgMatch[2] });
    }
    
    // Combine the data - skip duplicates by using a Set
    const seen = new Set();
    for (let i = 0; i < Math.min(mangaIds.length, images.length); i++) {
      const id = mangaIds[i];
      if (seen.has(id)) continue;
      seen.add(id);
      
      const image = images[i].url;
      // Alt text contains title twice, extract first part
      const altText = images[i].alt;
      const title = decodeHtmlEntities(altText.split(' ' + altText.split(' ')[0])[0] || altText);
      
      results.push({
        id,
        title,
        image,
        url: `https://mangapill.com/manga/${id}`,
        provider: 'MangaPill',
      });
    }
    
    // Check for next page
    const hasNextPage = html.includes(`page=${page + 1}"`);
    
    return {
      currentPage: page,
      hasNextPage,
      results,
    };
  } catch (error) {
    console.error('MangaPill new manga error:', error);
    throw new Error(`Failed to fetch new manga: ${error.message}`);
  }
}

// Get random manga
async function mangapillRandom() {
  const url = `https://mangapill.com/mangas/random`;
  
  try {
    // Follow the redirect to get the random manga
    const response = await fetch(url, { 
      headers: DEFAULT_HEADERS,
      redirect: 'follow'
    });
    const html = await response.text();
    const finalUrl = response.url;
    
    // Extract manga ID from final URL
    const urlMatch = finalUrl.match(/\/manga\/(.+)$/);
    const mangaId = urlMatch ? urlMatch[1] : null;
    
    if (!mangaId) {
      throw new Error('Failed to get random manga');
    }
    
    // Parse the manga page
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : mangaId;
    
    const imageMatch = html.match(/<img[^>]*src="(https:\/\/cdn[^"]+)"[^>]*\/>/i);
    const image = imageMatch ? imageMatch[1] : null;
    
    const descMatch = html.match(/<p[^>]*class="[^"]*text--secondary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripHtmlTags(descMatch[1]).trim() : '';
    
    // Extract genres
    const genreMatches = extractAllMatches(html, /<a[^>]*href="\/search\?genre=[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres = genreMatches.map(m => decodeHtmlEntities(m[1]));
    
    return {
      id: mangaId,
      title,
      image,
      description: decodeHtmlEntities(description),
      genres,
      url: finalUrl,
      provider: 'MangaPill',
    };
  } catch (error) {
    console.error('MangaPill random error:', error);
    throw new Error(`Failed to fetch random manga: ${error.message}`);
  }
}

// Get home page data (featured chapters, trending manga)
async function mangapillHomeData() {
  const url = 'https://mangapill.com';
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    // Extract featured chapters
    const featuredChapters = [];
    const featuredPattern = /<a\s+href="\/chapters\/([^"]+)"[^>]*>\s*<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]+)"[\s\S]*?<a\s+href="\/manga\/([^"]+)">\s*<div[^>]*>([^<]+)<\/div>/gi;
    let match;
    let count = 0;
    while ((match = featuredPattern.exec(html)) !== null && count < 12) {
      const chapterId = match[1];
      const image = match[2];
      const altText = match[3];
      const mangaId = match[4];
      const mangaTitle = decodeHtmlEntities(match[5].trim());
      
      // Extract chapter number from alt text
      const numMatch = altText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapterNumber = numMatch ? numMatch[1] : 'Unknown';
      
      featuredChapters.push({
        chapterId,
        chapterNumber,
        chapterTitle: altText,
        mangaId,
        mangaTitle,
        image,
        chapterUrl: `https://mangapill.com/chapters/${chapterId}`,
        mangaUrl: `https://mangapill.com/manga/${mangaId}`,
      });
      count++;
    }
    
    // Extract trending manga (after "Trending Mangas" section)
    const trendingManga = [];
    const trendingSection = html.split('Trending Mangas')[1] || '';
    const trendingPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*class="relative block"[^>]*>[\s\S]*?<img[^>]*data-src="([^"]+)"[^>]*>[\s\S]*?<a[^>]*href="\/manga\/[^"]+"[^>]*>\s*<div[^>]*>([^<]+)<\/div>/gi;
    let trendingMatch;
    let trendingCount = 0;
    while ((trendingMatch = trendingPattern.exec(trendingSection)) !== null && trendingCount < 10) {
      const id = trendingMatch[1];
      const image = trendingMatch[2];
      const title = decodeHtmlEntities(trendingMatch[3].trim());
      
      trendingManga.push({
        id,
        title,
        image,
        url: `https://mangapill.com/manga/${id}`,
      });
      trendingCount++;
    }
    
    return {
      featuredChapters,
      trendingManga,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('MangaPill home data error:', error);
    throw new Error(`Failed to fetch home data: ${error.message}`);
  }
}

// ============================================
// IMAGE PROXY (Fast image loading with caching)
// ============================================

// In-memory image cache for frequently accessed images
const imageCache = new Map();
const IMAGE_CACHE_DURATION = 3600000; // 1 hour
const MAX_IMAGE_CACHE_SIZE = 100; // Max cached images

async function proxyImage(imageUrl, env) {
  if (!imageUrl) {
    return new Response('Image URL is required', { status: 400 });
  }

  try {
    // Check in-memory cache first
    const cached = imageCache.get(imageUrl);
    if (cached && Date.now() - cached.timestamp < IMAGE_CACHE_DURATION) {
      return new Response(cached.data, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Cache': 'HIT',
          ...corsHeaders(env),
        },
      });
    }

    // Fetch the image
    const response = await fetch(imageUrl, {
      headers: {
        'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://mangapill.com/',
      },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    const imageData = await response.arrayBuffer();

    // Cache the image (limit cache size)
    if (imageCache.size >= MAX_IMAGE_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }
    imageCache.set(imageUrl, {
      data: imageData,
      contentType,
      timestamp: Date.now(),
    });

    return new Response(imageData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Cache': 'MISS',
        ...corsHeaders(env),
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new Response(`Image proxy error: ${error.message}`, { status: 500 });
  }
}

// ============================================
// MANGADEX PROVIDER (API-based)
// ============================================

async function mangadexSearch(query, page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist`;
  
  try {
    const response = await fetch(url, { 
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Check if response is valid JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('MangaDex returned non-JSON response:', text.substring(0, 200));
      throw new Error('MangaDex API returned invalid response (possibly rate limited)');
    }
    
    // Check for error response
    if (data.result === 'error') {
      throw new Error(data.errors?.[0]?.detail || 'MangaDex API error');
    }
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Unexpected response format from MangaDex API');
    }
    
    const results = data.data.map(manga => {
      const coverArt = manga.relationships.find(r => r.type === 'cover_art');
      const coverFileName = coverArt?.attributes?.fileName;
      const image = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;
      
      return {
        id: manga.id,
        title: manga.attributes.title.en || Object.values(manga.attributes.title)[0],
        altTitles: manga.attributes.altTitles,
        description: manga.attributes.description?.en || '',
        image,
        url: `https://mangadex.org/title/${manga.id}`,
        provider: 'MangaDex',
      };
    });
    
    return {
      currentPage: page,
      hasNextPage: data.total > offset + limit,
      results,
    };
  } catch (error) {
    console.error('MangaDex search error:', error);
    throw new Error(`MangaDex search failed: ${error.message}`);
  }
}

async function mangadexInfo(mangaId) {
  const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
  
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('MangaDex API returned invalid response');
    }
    
    if (data.result === 'error') {
      throw new Error(data.errors?.[0]?.detail || 'MangaDex API error');
    }
    
    const manga = data.data;
    
    const coverArt = manga.relationships.find(r => r.type === 'cover_art');
    const coverFileName = coverArt?.attributes?.fileName;
    const image = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;
    
    // Get chapters
    const chaptersUrl = `https://api.mangadex.org/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc`;
    const chaptersResponse = await fetch(chaptersUrl, { headers: { 'Accept': 'application/json' } });
    const chaptersData = await chaptersResponse.json();
    
    const chapters = chaptersData.data.map(ch => ({
      id: ch.id,
      title: ch.attributes.title || `Chapter ${ch.attributes.chapter}`,
      chapterNumber: ch.attributes.chapter,
      volume: ch.attributes.volume,
      pages: ch.attributes.pages,
    }));
    
    return {
      id: manga.id,
      title: manga.attributes.title.en || Object.values(manga.attributes.title)[0],
      altTitles: manga.attributes.altTitles,
      description: manga.attributes.description?.en || '',
      image,
      status: manga.attributes.status?.toUpperCase() || 'UNKNOWN',
      genres: manga.attributes.tags.map(t => t.attributes.name.en),
      chapters,
      totalChapters: chapters.length,
      url: `https://mangadex.org/title/${manga.id}`,
      provider: 'MangaDex',
    };
  } catch (error) {
    console.error('MangaDex info error:', error);
    throw new Error(`Failed to fetch manga info: ${error.message}`);
  }
}

async function mangadexRead(chapterId) {
  const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
  
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('MangaDex API returned invalid response');
    }
    
    const baseUrl = data.baseUrl;
    const hash = data.chapter.hash;
    const pages = data.chapter.data.map((filename, index) => ({
      page: index + 1,
      img: `${baseUrl}/data/${hash}/${filename}`,
    }));
    
    return pages;
  } catch (error) {
    console.error('MangaDex read error:', error);
    throw new Error(`Failed to fetch chapter pages: ${error.message}`);
  }
}

// ============================================
// PROVIDER ROUTING
// ============================================

async function mangaSearch(provider, query, page = 1) {
  switch (provider) {
    case 'mangadex':
      return await mangadexSearch(query, page);
    case 'mangapill':
      return await mangapillSearch(query, page);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}

async function mangaInfo(provider, id) {
  switch (provider) {
    case 'mangadex':
      return await mangadexInfo(id);
    case 'mangapill':
      return await mangapillInfo(id);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}

async function mangaRead(provider, chapterId) {
  switch (provider) {
    case 'mangadex':
      return await mangadexRead(chapterId);
    case 'mangapill':
      return await mangapillRead(chapterId);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}

// ============================================
// ROUTE HANDLERS
// ============================================

async function handleHome(env, baseUrl, request) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emnex Manga API - by emnextech</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #010409;
      --bg-card: #161b22;
      --bg-hover: #21262d;
      --border-color: #30363d;
      --divider: #2f353c;
      --text-primary: #ffffff;
      --text-secondary: #8b949e;
      --accent: #39d353;
      --accent-hover: #2ea043;
      --accent-glow: rgba(57, 211, 83, 0.25);
      --link: #39d353;
      --link-hover: #58e07b;
      --success: #39d353;
      --warning: #d29922;
      --error: #f85149;
      --info: #58a6ff;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', Ubuntu, sans-serif;
      background-color: var(--bg-primary);
      min-height: 100vh;
      color: var(--text-primary);
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }
    
    /* Header */
    header {
      background-color: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 48px 0;
      text-align: center;
    }
    
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    
    .logo-icon {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      overflow: hidden;
      border: 2px solid var(--accent);
      box-shadow: 0 0 20px var(--accent-glow);
    }
    
    .logo-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    h1 {
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.5px;
    }
    
    .creator {
      color: var(--accent);
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .version {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    .badge {
      display: inline-block;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 12px;
    }
    
    /* Main Content */
    main {
      padding: 40px 0;
    }
    
    .section {
      margin-bottom: 32px;
    }
    
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .section-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .section-icon {
      color: var(--accent);
      font-size: 1.25rem;
    }
    
    /* Endpoints Grid */
    .endpoints {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 16px;
    }
    
    .endpoint {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    
    .endpoint:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent-glow);
    }
    
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .method {
      background: var(--accent);
      color: var(--bg-primary);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .endpoint-path {
      font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', Menlo, monospace;
      color: var(--text-primary);
      font-size: 0.875rem;
      background: var(--bg-hover);
      padding: 4px 8px;
      border-radius: 4px;
      flex: 1;
      word-break: break-all;
    }
    
    .endpoint-desc {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    
    .test-btn {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--accent);
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s ease;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .test-btn:hover {
      background: var(--accent);
      color: var(--bg-primary);
    }
    
    .test-btn:active {
      transform: scale(0.98);
    }
    
    .test-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .test-btn::before {
      content: '\u25B6';
      font-size: 0.7rem;
    }
    
    /* Result Container */
    #result-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-top: 24px;
      display: none;
      overflow: hidden;
    }
    
    #result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    .result-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    #result-status {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    #result-status.success {
      background: rgba(57, 211, 83, 0.15);
      color: var(--success);
      border: 1px solid var(--success);
    }
    
    #result-status.error {
      background: rgba(248, 81, 73, 0.15);
      color: var(--error);
      border: 1px solid var(--error);
    }
    
    #result-status.loading {
      background: rgba(88, 166, 255, 0.15);
      color: var(--info);
      border: 1px solid var(--info);
    }
    
    #result-endpoint {
      font-family: 'SFMono-Regular', 'Consolas', monospace;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    .close-btn {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s ease;
    }
    
    .close-btn:hover {
      background: var(--error);
      color: var(--text-primary);
      border-color: var(--error);
    }
    
    #result-body {
      padding: 20px;
      max-height: 500px;
      overflow: auto;
    }
    
    #result-body pre {
      font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', Menlo, monospace;
      font-size: 0.8rem;
      line-height: 1.6;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    /* JSON Syntax Highlighting */
    .json-key { color: var(--info); }
    .json-string { color: var(--accent); }
    .json-number { color: var(--warning); }
    .json-boolean { color: #ff7b72; }
    .json-null { color: var(--text-secondary); }
    
    /* Stats Section */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 4px;
    }
    
    .stat-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    /* Footer */
    footer {
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      padding: 32px 0;
      text-align: center;
      margin-top: 40px;
    }
    
    footer p {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    footer a {
      color: var(--link);
      text-decoration: none;
      transition: color 0.2s ease;
    }
    
    footer a:hover {
      color: var(--link-hover);
    }
    
    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: var(--bg-secondary);
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-secondary);
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .endpoints {
        grid-template-columns: 1fr;
      }
      
      header {
        padding: 32px 0;
      }
      
      h1 {
        font-size: 1.5rem;
      }
      
      .stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="logo">
        <h1>Emnex Manga API</h1>
      </div>
      <p class="creator">emnextech</p>
      <p class="version">Version 1.2.0</p>
      <span class="badge">Powered by Cloudflare Workers</span>
    </div>
  </header>

  <main>
    <div class="container">
      <!-- Stats -->
      <div class="stats">
        <div class="stat-card">
          <div class="stat-value">11</div>
          <div class="stat-label">Endpoints</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">46</div>
          <div class="stat-label">Genres</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">6</div>
          <div class="stat-label">Types</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">v1</div>
          <div class="stat-label">API Version</div>
        </div>
      </div>

      <!-- Endpoints Section -->
      <div class="section">
        <div class="section-header">
          <span class="section-icon">\u26A1</span>
          <h2>API Endpoints</h2>
        </div>
        
        <div class="endpoints">
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/search/{query}</span>
            </div>
            <p class="endpoint-desc">Search manga by title. Returns matching manga with cover images.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/search/naruto')">Test: Search "naruto"</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/info/{id}</span>
            </div>
            <p class="endpoint-desc">Get manga details including chapters, genres, and description.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/info/2/one-piece')">Test: One Piece Info</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/read/{chapterId}</span>
            </div>
            <p class="endpoint-desc">Get chapter page images for reading.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/read/2-10001000/one-piece-chapter-1')">Test: Read Chapter</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/recent</span>
            </div>
            <p class="endpoint-desc">Get recently updated manga chapters.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/recent')">Test: Recent Updates</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/new</span>
            </div>
            <p class="endpoint-desc">Get newly added manga titles.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/new')">Test: New Manga</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/random</span>
            </div>
            <p class="endpoint-desc">Get a random manga recommendation.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/random')">Test: Random Manga</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/genres</span>
            </div>
            <p class="endpoint-desc">List all available genres, types, and statuses.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/genres')">Test: Get Genres</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/advanced-search</span>
            </div>
            <p class="endpoint-desc">Advanced search with genre, type, and status filters.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/advanced-search?genre=Action&type=manhwa')">Test: Action Manhwa</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/home</span>
            </div>
            <p class="endpoint-desc">Get home page data: featured chapters, trending manga, and API info.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/home')">Test: Home Data</button>
          </div>

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/image?url={imageUrl}</span>
            </div>
            <p class="endpoint-desc">Image proxy with caching. Fast image loading with 24h cache headers.</p>
            <button class="test-btn" onclick="testImageProxy()">Test: Image Proxy</button>
          </div>
        </div>
      </div>

      <!-- Result Container -->
      <div id="result-container">
        <div id="result-header">
          <div class="result-info">
            <span id="result-status">200</span>
            <span id="result-endpoint">/api/v1/...</span>
          </div>
          <button class="close-btn" onclick="closeResult()">\u2715 Close</button>
        </div>
        <div id="result-body">
          <pre id="result-json"></pre>
        </div>
      </div>
    </div>
  </main>

  <footer>
    <div class="container">
      <p>\u00A9 2024-2026 <a href="https://github.com/emnextech">emnextech</a> \u2022 Manga API v1.2.0</p>
    </div>
  </footer>

  <script>
    function syntaxHighlight(json) {
      if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
      }
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });
    }

    async function testEndpoint(path) {
      const container = document.getElementById('result-container');
      const statusEl = document.getElementById('result-status');
      const endpointEl = document.getElementById('result-endpoint');
      const jsonEl = document.getElementById('result-json');
      
      container.style.display = 'block';
      statusEl.textContent = 'Loading...';
      statusEl.className = 'loading';
      endpointEl.textContent = path;
      jsonEl.innerHTML = '<span style="color: var(--text-secondary);">Fetching data...</span>';
      
      try {
        const response = await fetch(path);
        const data = await response.json();
        
        statusEl.textContent = response.status + ' ' + (response.ok ? 'OK' : 'Error');
        statusEl.className = response.ok ? 'success' : 'error';
        jsonEl.innerHTML = syntaxHighlight(data);
      } catch (error) {
        statusEl.textContent = 'Error';
        statusEl.className = 'error';
        jsonEl.innerHTML = '<span style="color: var(--error);">' + error.message + '</span>';
      }
      
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    async function testImageProxy() {
      const container = document.getElementById('result-container');
      const statusEl = document.getElementById('result-status');
      const endpointEl = document.getElementById('result-endpoint');
      const jsonEl = document.getElementById('result-json');
      
      container.style.display = 'block';
      statusEl.textContent = 'Loading...';
      statusEl.className = 'loading';
      endpointEl.textContent = '/api/v1/image?url=...';
      jsonEl.innerHTML = '<span style="color: var(--text-secondary);">Testing image proxy...</span>';
      
      const testImageUrl = 'https://cdn.mangapill.com/covers/6-44605.jpg';
      const proxyUrl = '/api/v1/image?url=' + encodeURIComponent(testImageUrl);
      
      try {
        const start = performance.now();
        const response = await fetch(proxyUrl);
        const elapsed = (performance.now() - start).toFixed(0);
        const cacheStatus = response.headers.get('X-Cache') || 'N/A';
        
        if (response.ok) {
          statusEl.textContent = '200 OK';
          statusEl.className = 'success';
          jsonEl.innerHTML = syntaxHighlight({
            status: 'success',
            message: 'Image proxy working',
            testUrl: testImageUrl,
            proxyUrl: proxyUrl,
            cacheStatus: cacheStatus,
            loadTime: elapsed + 'ms',
            contentType: response.headers.get('Content-Type'),
            cacheControl: response.headers.get('Cache-Control'),
            note: 'Image loaded successfully. Use this endpoint to proxy manga images with caching.'
          });
        } else {
          statusEl.textContent = response.status + ' Error';
          statusEl.className = 'error';
          jsonEl.innerHTML = '<span style="color: var(--error);">Failed to load image</span>';
        }
      } catch (error) {
        statusEl.textContent = 'Error';
        statusEl.className = 'error';
        jsonEl.innerHTML = '<span style="color: var(--error);">' + error.message + '</span>';
      }
      
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    function closeResult() {
      document.getElementById('result-container').style.display = 'none';
    }
  </script>
</body>
</html>`;
  return htmlResponse(html, 200, env, request);
}

// JSON API home endpoint - returns scraped home data from MangaPill
async function handleApiHome(env, request) {
  const cacheKey = 'home';
  const now = Date.now();
  const cached = homeCache.get(cacheKey);
  
  // Cache for 5 minutes
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ 
      status: 'success',
      cached: true,
      ...cached.data 
    }, 200, env, request);
  }
  
  try {
    const homeData = await mangapillHomeData();
    
    const result = {
      name: 'Emnex Manga API',
      version: '1.2.0',
      provider: 'mangapill',
      ...homeData,
      endpoints: {
        search: 'GET /api/v1/search/:query',
        info: 'GET /api/v1/info/:id',
        read: 'GET /api/v1/read/:chapterId',
        recent: 'GET /api/v1/recent',
        new: 'GET /api/v1/new',
        random: 'GET /api/v1/random',
        genres: 'GET /api/v1/genres',
        advancedSearch: 'GET /api/v1/advanced-search',
        home: 'GET /api/v1/home',
        image: 'GET /api/v1/image?url={imageUrl}',
      },
    };
    
    homeCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', ...result }, 200, env, request);
  } catch (error) {
    // Return basic info on error
    return jsonResponse({
      status: 'success',
      name: 'Emnex Manga API',
      version: '1.2.0',
      error: error.message,
      endpoints: {
        search: 'GET /api/v1/search/:query',
        info: 'GET /api/v1/info/:id',
        read: 'GET /api/v1/read/:chapterId',
        recent: 'GET /api/v1/recent',
        new: 'GET /api/v1/new',
        random: 'GET /api/v1/random',
        genres: 'GET /api/v1/genres',
        advancedSearch: 'GET /api/v1/advanced-search',
        home: 'GET /api/v1/home',
        image: 'GET /api/v1/image?url={imageUrl}',
      },
    }, 200, env, request);
  }
}

async function handleProviders(env, request) {
  return jsonResponse({
    status: 'success',
    providers: Object.values(PROVIDERS).map(p => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      endpoints: [
        `GET /api/${p.id}/search/:query`,
        `GET /api/${p.id}/info/:id`,
        `GET /api/${p.id}/read/:chapterId`,
      ],
    })),
  }, 200, env, request);
}

async function handleSearch(provider, query, url, env, request) {
  const urlObj = new URL(url);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `search:${provider}:${query}:${page}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangaSearch(provider, query, page);
    searchCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, query, page, ...result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleInfo(provider, mangaId, url, env, request) {
  const cacheKey = `info:${provider}:${mangaId}`;
  const now = Date.now();
  const cached = infoCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.info) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangaInfo(provider, mangaId);
    infoCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, data: result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleRead(provider, chapterId, url, env, request) {
  const cacheKey = `pages:${provider}:${chapterId}`;
  const now = Date.now();
  const cached = pagesCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.pages) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangaRead(provider, chapterId);
    pagesCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, data: result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

// MangaPill-specific handlers
async function handleAdvancedSearch(url, env, request) {
  const urlObj = new URL(url);
  const query = urlObj.searchParams.get('q') || '';
  const genre = urlObj.searchParams.get('genre') || '';
  const type = urlObj.searchParams.get('type') || '';
  const status = urlObj.searchParams.get('status') || '';
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  
  const cacheKey = `advsearch:${query}:${genre}:${type}:${status}:${page}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangapillAdvancedSearch({ query, genre, type, status, page });
    searchCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleRecentChapters(url, env, request) {
  const urlObj = new URL(url);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  
  const cacheKey = `recent:${page}`;
  const now = Date.now();
  const cached = recentCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.recent) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangapillRecentChapters(page);
    recentCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleNewManga(url, env, request) {
  const urlObj = new URL(url);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  
  const cacheKey = `new:${page}`;
  const now = Date.now();
  const cached = newMangaCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.new) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request);
  }
  
  try {
    const result = await mangapillNewManga(page);
    newMangaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleRandomManga(env, request) {
  try {
    const result = await mangapillRandom();
    return jsonResponse({ status: 'success', provider: 'mangapill', data: result }, 200, env, request);
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleGenres(env, request) {
  return jsonResponse({
    status: 'success',
    provider: 'mangapill',
    data: {
      genres: MANGAPILL_GENRES,
      types: MANGAPILL_TYPES,
      statuses: MANGAPILL_STATUSES,
    },
  }, 200, env, request);
}

// ============================================
// MAIN WORKER EXPORT
// ============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      const requestOrigin = request.headers.get('Origin');
      return new Response(null, { headers: corsHeaders(env, requestOrigin) });
    }
    
    // All /api/v1/ endpoints are public
    const publicEndpoints = ['/', '/api/v1/home', '/api/v1/genres', '/api/v1/recent', '/api/v1/new', '/api/v1/random', '/api/v1/advanced-search'];
    const isPublic = publicEndpoints.includes(url.pathname) || 
                     url.pathname.startsWith('/api/v1/');
    
    if (!isPublic && !validateRequest(request, env)) {
      return errorResponse('Unauthorized access', 401, env, request);
    }
    
    try {
      // Home endpoint - HTML page with testing buttons
      if (url.pathname === '/') {
        return await handleHome(env, url.origin, request);
      }
      
      // API home - JSON response
      if (url.pathname === '/api/v1/home') {
        return await handleApiHome(env, request);
      }
      
      // Genres endpoint
      if (url.pathname === '/api/v1/genres') {
        return await handleGenres(env, request);
      }
      
      // Recent chapters
      if (url.pathname === '/api/v1/recent') {
        return await handleRecentChapters(request.url, env, request);
      }
      
      // New manga
      if (url.pathname === '/api/v1/new') {
        return await handleNewManga(request.url, env, request);
      }
      
      // Random manga
      if (url.pathname === '/api/v1/random') {
        return await handleRandomManga(env, request);
      }
      
      // Advanced search
      if (url.pathname === '/api/v1/advanced-search') {
        return await handleAdvancedSearch(request.url, env, request);
      }
      
      // Image proxy for fast image loading
      if (url.pathname === '/api/v1/image') {
        const imageUrl = url.searchParams.get('url');
        return await proxyImage(imageUrl, env);
      }
      
      // Parse /api/v1/:action/:param routes
      const v1Match = url.pathname.match(/^\/api\/v1\/([^\/]+)\/(.+)$/);
      
      if (v1Match) {
        const [, action, param] = v1Match;
        
        // Route to appropriate handler (using mangapill as default provider)
        if (action === 'search') {
          const query = decodeURIComponent(param);
          if (!query) return errorResponse('Search query is required', 400, env, request);
          return await handleSearch('mangapill', query, request.url, env, request);
        }
        
        if (action === 'info') {
          const mangaId = decodeURIComponent(param);
          if (!mangaId) return errorResponse('Manga ID is required', 400, env, request);
          return await handleInfo('mangapill', mangaId, request.url, env, request);
        }
        
        if (action === 'read') {
          const chapterId = decodeURIComponent(param);
          if (!chapterId) return errorResponse('Chapter ID is required', 400, env, request);
          return await handleRead('mangapill', chapterId, request.url, env, request);
        }
        
        return errorResponse(`Invalid action: ${action}. Valid actions: search, info, read`, 400, env, request);
      }
      
      return errorResponse('Endpoint not found. Visit / for available endpoints.', 404, env, request);
      
    } catch (error) {
      console.error('Worker error:', error);
      return errorResponse(`Internal server error: ${error.message}`, 500, env, request);
    }
  },
};
