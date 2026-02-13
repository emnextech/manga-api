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
const manhwaCache = new Map();
const comickCache = new Map();

// ============================================
// PROVIDERS CONFIGURATION (add comickCache above)
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
  KOMIKSTATION: {
    name: 'Komikstation',
    baseUrl: 'https://komikstation.org',
    id: 'komikstation',
    status: 'active',
  },
  COMICK: {
    name: 'ComicK',
    baseUrl: 'https://comick.art',
    apiUrl: 'https://comick.art/api',
    id: 'comick',
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
  const norm = (o) => (o || '').trim().replace(/\/+$/, '');

  if (allowedOrigin !== '*' && requestOrigin) {
    const allowedOrigins = allowedOrigin.split(',').map(norm).filter(Boolean);
    const origin = norm(requestOrigin);
    if (allowedOrigins.includes(origin)) allowedOrigin = origin;
    else if (allowedOrigins.length) allowedOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Worker-Auth, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Cache-Control presets for API responses (browser + CDN caching)
const CACHE_CONTROL = {
  search: 'public, max-age=180, stale-while-revalidate=120',   // 3 min + 2 min revalidate
  info: 'public, max-age=900, stale-while-revalidate=300',     // 15 min + 5 min revalidate
  pages: 'public, max-age=1800, stale-while-revalidate=600',  // 30 min + 10 min revalidate
  short: 'public, max-age=60, stale-while-revalidate=30',     // 1 min
};

function jsonResponse(data, status = 200, env = {}, request = null, options = {}) {
  const responseData = { creator: 'emnextech', ...data };
  const requestOrigin = request?.headers?.get('Origin');
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(env, requestOrigin),
  };
  if (options.cacheControl) headers['Cache-Control'] = options.cacheControl;
  return new Response(JSON.stringify(responseData), { status, headers });
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
  const norm = (o) => (o || '').trim().replace(/\/+$/, '');
  const requestOrigin = request.headers.get('Origin');
  
  // Same-origin bypass first: requests from the API's own domain (e.g. docs page) skip origin + token
  try {
    const apiOrigin = new URL(request.url).origin;
    if (requestOrigin && norm(requestOrigin) === norm(apiOrigin)) {
      return { valid: true };
    }
  } catch (_) {}
  
  // Check 1: Validate Origin (if ALLOWED_ORIGIN is set and not wildcard)
  const allowedOrigin = env?.ALLOWED_ORIGIN || '*';
  if (allowedOrigin !== '*') {
    const allowedOrigins = allowedOrigin.split(',').map(norm).filter(Boolean);
    const origin = norm(requestOrigin);
    if (requestOrigin && !allowedOrigins.includes(origin)) {
      return { valid: false, reason: 'origin' };
    }
  }

  // Check 2: Validate Token (if SECRET_TOKEN is set)
  if (env.SECRET_TOKEN) {
    const authHeader = request.headers.get('X-Worker-Auth');
    if (authHeader === env.SECRET_TOKEN) {
      return { valid: true };
    }

    if (allowQueryToken) {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get('token');
      if (queryToken === env.SECRET_TOKEN) {
        return { valid: true };
      }
    }
    
    return { valid: false, reason: 'token' };
  }

  return { valid: true };
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
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.append('page', page);
  const url = `https://mangapill.com/search?${params.toString()}`;
  
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    
    const results = [];
    
    // Extract manga from search results (support both src and data-src for lazy-loaded images)
    const mangaPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    
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
    
    // Extract manga from search results (support both src and data-src for lazy-loaded images)
    const mangaPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    
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

// Get trending manga only (from home page)
async function mangapillTrending() {
  const homeData = await mangapillHomeData();
  return homeData.trendingManga || [];
}

// ============================================
// COMICK PROVIDER (comick.art - manga/manhwa/manhua)
// ============================================

const COMICK_HEADERS = {
  ...DEFAULT_HEADERS,
  'Accept': 'application/json',
  'Referer': 'https://comick.art/',
};

async function comickSearch(query, page = 1) {
  const cursor = page > 1 ? `&page=${page}` : '';
  const url = `https://comick.art/api/search?q=${encodeURIComponent(query)}${cursor}`;
  try {
    const response = await fetch(url, { headers: COMICK_HEADERS });
    const json = await response.json();
    const data = json.data || [];
    const results = data.map((m) => ({
      id: m.slug,
      title: m.title || m.slug,
      altTitles: m.md_titles?.map((t) => t.title) || [],
      image: m.default_thumbnail || (m.md_covers?.[0]?.b2key ? `https://meo.comick.pictures/${String(m.md_covers[0].b2key).replace(/^\/+/, '')}` : ''),
      url: `https://comick.art/comic/${m.slug}`,
      provider: 'ComicK',
    }));
    return {
      currentPage: page,
      hasNextPage: !!json.next_cursor,
      results,
      nextCursor: json.next_cursor || null,
    };
  } catch (error) {
    console.error('ComicK search error:', error);
    throw new Error(`ComicK search failed: ${error.message}`);
  }
}

async function comickInfo(slug) {
  const url = `https://comick.art/comic/${slug}`;
  try {
    const response = await fetch(url, { headers: COMICK_HEADERS });
    const html = await response.text();
    const scriptMatch = html.match(/<script[^>]*id=["']comic-data["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) throw new Error('Comic data not found');
    const data = JSON.parse(scriptMatch[1].trim());
    const comicSlug = data.slug || '';
    if (!comicSlug) throw new Error('Comic slug not found');
    const chapterListUrl = `https://comick.art/api/comics/${comicSlug}/chapter-list?page=1`;
    const chResponse = await fetch(chapterListUrl, { headers: COMICK_HEADERS });
    const chJson = await chResponse.json();
    const chapterData = chJson.data || [];
    const chapters = chapterData.map((ch) => ({
      id: `${data.slug}/${ch.hid}-chapter-${ch.chap}-${ch.lang || 'en'}`,
      title: ch.title || ch.chap,
      chapterNumber: ch.chap,
      volumeNumber: ch.vol || '',
      releaseDate: ch.created_at,
      lang: ch.lang || 'en',
    }));
    const imageUrl = data.default_thumbnail;
    const fullImage = imageUrl?.startsWith('http') ? imageUrl : imageUrl ? `https://meo.comick.pictures/${String(imageUrl).replace(/^\/+/, '')}` : null;
    const altTitles = Array.isArray(data.md_titles) ? data.md_titles.map((t) => t?.title).filter(Boolean) : [];
    const genres = Array.isArray(data.md_comic_md_genres) ? data.md_comic_md_genres.map((g) => g?.md_genres?.name).filter(Boolean) : [];
    return {
      id: data.slug,
      title: data.title,
      altTitles,
      description: data.desc || data.parsed || '',
      image: fullImage,
      genres,
      status: data.status === 0 ? 'ongoing' : 'completed',
      chapters,
      totalChapters: chapters.length,
      provider: 'ComicK',
      url: `https://comick.art/comic/${data.slug}`,
    };
  } catch (error) {
    console.error('ComicK info error:', error);
    throw new Error(`ComicK info failed: ${error.message}`);
  }
}

async function comickChapter(chapterId) {
  const url = `https://comick.art/api/comics/${chapterId}`;
  try {
    const response = await fetch(url, { headers: COMICK_HEADERS });
    const json = await response.json();
    const chapter = json.chapter || json.data?.chapter;
    if (!chapter?.images) throw new Error('Chapter images not found');
    const pages = chapter.images.map((img, i) => {
      const imgUrl = typeof img === 'string' ? img : (img.url || (img.b2key ? `https://meo.comick.pictures/${String(img.b2key).replace(/^\/+/, '')}` : ''));
      return { page: i + 1, img: imgUrl };
    });
    return {
      chapterId,
      title: chapter.title || chapter.chap || chapterId,
      pages,
      provider: 'ComicK',
    };
  } catch (error) {
    console.error('ComicK chapter error:', error);
    throw new Error(`ComicK chapter failed: ${error.message}`);
  }
}

// ============================================
// KOMIKSTATION PROVIDER (Manhwa - komikstation.org)
// ============================================

const KOMIKSTATION_HEADERS = {
  ...DEFAULT_HEADERS,
  'Referer': 'https://komikstation.org/',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
};

async function komikstationManhwaPopular(page = 1) {
  const url = page > 1
    ? `https://komikstation.org/manga/?page=${page}&type=manhwa&order=popular`
    : 'https://komikstation.org/manga/?type=manhwa&order=popular';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);
    const html = await response.text();
    const results = [];
    // Use block-based parsing to avoid CPU-heavy regex on full HTML
    const blocks = html.split(/<div[^>]*class="[^"]*bsx[^"]*"/i);
    for (let i = 1; i < blocks.length && results.length < 50; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/href="(https:\/\/komikstation\.org\/[^"]+)"|href="(\/[^"]+)"/i);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i);
      const titleMatch = block.match(/class="[^"]*tt[^"]*"[^>]*>([^<]+)</i) || block.match(/title="([^"]+)"/i);
      const epMatch = block.match(/class="[^"]*epxs[^"]*"[^>]*>([^<]+)</i);
      const rateMatch = block.match(/class="[^"]*numscore[^"]*"[^>]*>([^<]+)</i);
      if (linkMatch && imgMatch) {
        const href = linkMatch[1] || linkMatch[2] || '';
        const mUrl = href.startsWith('http') ? href : `https://komikstation.org${href}`;
        let mangaId = mUrl.includes('/manga/') ? mUrl.replace(/^https?:\/\/[^/]+\/manga\//, '').replace(/\/$/, '') : '';
        if (!mangaId && mUrl.includes('-chapter-')) {
          mangaId = mUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/-chapter-\d+(?:\.\d+)?.*$/i, '');
        }
        if (!mangaId) mangaId = mUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
        results.push({
          id: mangaId,
          title: decodeHtmlEntities((titleMatch ? (titleMatch[1] || '').trim() : 'Unknown')),
          image: imgMatch[1].startsWith('http') ? imgMatch[1] : `https://komikstation.org${imgMatch[1]}`,
          link: mUrl,
          latestChapter: epMatch ? epMatch[1].trim() : '',
          rating: rateMatch ? rateMatch[1].trim() : '',
          provider: 'Komikstation',
        });
      }
    }
    const hasNextPage = html.includes(`page=${page + 1}`);
    return { currentPage: page, hasNextPage, results };
  } catch (error) {
    console.error('Komikstation manhwa popular error:', error);
    throw new Error(`Failed to fetch manhwa popular: ${error.message}`);
  }
}

async function komikstationManhwaOngoing(page = 1) {
  const url = page > 1
    ? `https://komikstation.org/manga/?page=${page}&status=ongoing&type=manhwa&order=`
    : 'https://komikstation.org/manga/?status=ongoing&type=manhwa&order=';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);
    const html = await response.text();
    const results = [];
    const blocks = html.split(/<div[^>]*class="[^"]*bs[^"]*"/i);
    for (let i = 1; i < blocks.length && results.length < 50; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/href="(https:\/\/komikstation\.org\/[^"]+)"|href="(\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);
      const titleMatch = block.match(/class="[^"]*tt[^"]*"[^>]*>([^<]+)</i) || block.match(/title="([^"]+)"/);
      const epMatch = block.match(/class="[^"]*epxs[^"]*"[^>]*>([^<]+)</i);
      const rateMatch = block.match(/class="[^"]*numscore[^"]*"[^>]*>([^<]+)</i);
      if (linkMatch && imgMatch) {
        const href = linkMatch[1] || linkMatch[2] || '';
        const fullUrl = href.startsWith('http') ? href : `https://komikstation.org${href}`;
        let mangaId = fullUrl.includes('/manga/') ? fullUrl.replace(/^https?:\/\/[^/]+\/manga\//, '').replace(/\/$/, '') : '';
        if (!mangaId && fullUrl.includes('-chapter-')) {
          mangaId = fullUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/-chapter-\d+(?:\.\d+)?.*$/i, '');
        }
        if (!mangaId) mangaId = fullUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
        results.push({
          id: mangaId,
          title: decodeHtmlEntities((titleMatch ? (titleMatch[1] || '').trim() : 'Unknown')),
          image: imgMatch[1].startsWith('http') ? imgMatch[1] : `https://komikstation.org${imgMatch[1]}`,
          link: fullUrl,
          latestChapter: epMatch ? epMatch[1].trim() : '',
          rating: rateMatch ? rateMatch[1].trim() : '',
          provider: 'Komikstation',
        });
      }
    }
    const hasNextPage = html.includes(`page=${page + 1}`);
    return { currentPage: page, hasNextPage, results };
  } catch (error) {
    console.error('Komikstation manhwa ongoing error:', error);
    throw new Error(`Failed to fetch manhwa ongoing: ${error.message}`);
  }
}

async function komikstationManhwaDetail(manhwaId) {
  const url = `https://komikstation.org/manga/${manhwaId}`;
  try {
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS });
    const html = await response.text();
    const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const titleMatch = html.match(/class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</i);
    let title = (ogTitleMatch ? decodeHtmlEntities(ogTitleMatch[1].trim()) : '') ||
      (titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '');
    if (!title || /^[\w-]+$/.test(title)) {
      title = manhwaId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    const imgMatch = html.match(/class="[^"]*thumb[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const imageSrc = imgMatch ? imgMatch[1] : null;
    const synopsisMatch = html.match(/class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const synopsis = synopsisMatch ? stripHtmlTags(synopsisMatch[1]).trim() : '';
    const ratingMatch = html.match(/class="[^"]*num[^"]*"[^>]*>([^<]+)</i);
    const rating = ratingMatch ? ratingMatch[1].trim() : '';
    const genres = [];
    const genreMatches = extractAllMatches(html, /<a[^>]*href="[^"]*genres\/[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const seenGenres = new Set();
    genreMatches.forEach(g => {
      const name = decodeHtmlEntities(g[1]).trim();
      if (name && !seenGenres.has(name.toLowerCase())) {
        seenGenres.add(name.toLowerCase());
        genres.push({ genreName: name, genreLink: '' });
      }
    });
    const chapters = [];
    const chapterPattern = /<li[^>]*>[\s\S]*?<span[^>]*class="[^"]*chapternum[^"]*"[^>]*>([^<]*)<\/span>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*chapterdate[^"]*"[^>]*>([^<]*)<\/span>/gi;
    let ch;
    while ((ch = chapterPattern.exec(html)) !== null) {
      const chapterLink = ch[2].replace(/^https?:\/\/[^/]+\//, '');
      chapters.push({
        chapterNum: ch[1].trim(),
        chapterLink,
        chapterDate: ch[3].trim(),
      });
    }
    if (chapters.length === 0) {
      const altChPattern = /<a[^>]*href="(https:\/\/komikstation\.org\/([^"]+))"[^>]*>[\s\S]*?chapter[^<]*<\/a>/gi;
      let ach;
      while ((ach = altChPattern.exec(html)) !== null) {
        chapters.push({
          chapterNum: ach[2].replace(/-chapter-\d+.*$/i, '').replace(/-/g, ' '),
          chapterLink: ach[2],
          chapterDate: '',
        });
      }
    }
    return {
      id: manhwaId,
      title,
      imageSrc,
      synopsis,
      rating,
      genres,
      chapters,
      totalChapters: chapters.length,
      provider: 'Komikstation',
      url: `https://komikstation.org/manga/${manhwaId}`,
    };
  } catch (error) {
    console.error('Komikstation manhwa detail error:', error);
    throw new Error(`Failed to fetch manhwa detail: ${error.message}`);
  }
}

async function komikstationManhwaChapter(chapterId) {
  // Resolve ddl?id=XXX (download link ID) to ?p=XXX - WordPress redirects to canonical chapter URL
  let fetchUrl = `https://komikstation.org/${chapterId}`;
  const ddlMatch = chapterId.match(/^ddl\?id=(\d+)$/i);
  if (ddlMatch) {
    fetchUrl = `https://komikstation.org/?p=${ddlMatch[1]}`;
  }
  try {
    const response = await fetch(fetchUrl, { headers: KOMIKSTATION_HEADERS, redirect: 'follow' });
    const html = await response.text();
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : chapterId;
    let images = [];
    let prevChapter = null;
    let nextChapter = null;
    const scriptMatch = html.match(/ts_reader\.run\((.*?)\);\s*<\/script>/s);
    if (scriptMatch) {
      const jsonStr = scriptMatch[1].replace(/\\'/g, "'");
      try {
        const jsonObject = JSON.parse(jsonStr);
        images = jsonObject?.sources?.[0]?.images || [];
        prevChapter = jsonObject.prevUrl || null;
        nextChapter = jsonObject.nextUrl || null;
      } catch (_) {}
    }
    if (images.length === 0) {
      const readerMatch = html.match(/<div[^>]*id=["']readerarea["'][^>]*>([\s\S]*?)<\/div>/i);
      if (readerMatch) {
        const imgMatches = readerMatch[1].matchAll(/<img[^>]*src=["']([^"']+)["']/gi);
        for (const m of imgMatches) images.push(m[1]);
      }
    }
    if (images.length === 0) throw new Error('Chapter images not found');
    const pages = images.map((img, i) => ({ page: i + 1, img }));
    const chapters = [];
    const chapterOptionPattern = /<option[^>]*value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;
    let opt;
    while ((opt = chapterOptionPattern.exec(html)) !== null) {
      if (opt[2] && !opt[2].includes('Pilih')) {
        chapters.push({ title: opt[2].trim(), url: opt[1] || null });
      }
    }
    return {
      title,
      chapterId,
      images: pages,
      prevChapter,
      nextChapter,
      chapters,
      provider: 'Komikstation',
    };
  } catch (error) {
    console.error('Komikstation chapter error:', error);
    throw new Error(`Failed to fetch chapter: ${error.message}`);
  }
}

async function komikstationManhwaSearch(query, page = 1) {
  const url = page > 1
    ? `https://komikstation.org/page/${page}/?s=${encodeURIComponent(query)}`
    : `https://komikstation.org/?s=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS });
    const html = await response.text();
    const results = [];
    const blocks = html.split(/<div[^>]*class="[^"]*bs[^"]*"/i);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/href="(https:\/\/komikstation\.org\/[^"]+)"|href="(\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);
      const titleMatch = block.match(/title="([^"]+)"|class="[^"]*tt[^"]*"[^>]*>([^<]+)</i);
      const epMatch = block.match(/class="[^"]*epxs[^"]*"[^>]*>([^<]+)</i);
      const rateMatch = block.match(/class="[^"]*numscore[^"]*"[^>]*>([^<]+)</i);
      if (linkMatch && imgMatch) {
        const href = linkMatch[1] || linkMatch[2] || '';
        const fullUrl = href.startsWith('http') ? href : `https://komikstation.org${href}`;
        let mangaId = '';
        if (fullUrl.includes('/manga/')) {
          mangaId = fullUrl.replace(/^https?:\/\/[^/]+\/manga\//, '').replace(/\/$/, '');
        } else {
          const pathPart = fullUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
          mangaId = pathPart.includes('-chapter-') ? pathPart.replace(/-chapter-\d+(?:\.\d+)?.*$/i, '') : pathPart;
        }
        if (!mangaId) continue;
        results.push({
          id: mangaId,
          title: decodeHtmlEntities((titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : 'Unknown')),
          image: imgMatch[1].startsWith('http') ? imgMatch[1] : `https://komikstation.org${imgMatch[1]}`,
          link: fullUrl,
          latestChapter: epMatch ? epMatch[1].trim() : '',
          rating: rateMatch ? rateMatch[1].trim() : '',
          provider: 'Komikstation',
        });
      }
    }
    const hasNextPage = html.includes(`page=${page + 1}`);
    return { currentPage: page, hasNextPage, results };
  } catch (error) {
    console.error('Komikstation search error:', error);
    throw new Error(`Search failed: ${error.message}`);
  }
}

async function komikstationManhwaGenres() {
  const url = 'https://komikstation.org/manga/list-mode/';
  try {
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS });
    const html = await response.text();
    const genres = [];
    const genrePattern = /<label[^>]*>([^<]+)<\/label>[\s\S]*?<input[^>]*value="([^"]+)"/gi;
    let g;
    while ((g = genrePattern.exec(html)) !== null) {
      genres.push({ label: decodeHtmlEntities(g[1].trim()), value: g[2].trim() });
    }
    return { genres };
  } catch (error) {
    console.error('Komikstation genres error:', error);
    throw new Error(`Failed to fetch genres: ${error.message}`);
  }
}

async function komikstationManhwaByGenre(genreId, page = 1) {
  const url = page > 1
    ? `https://komikstation.org/genres/${genreId}/page/${page}`
    : `https://komikstation.org/genres/${genreId}`;
  try {
    const response = await fetch(url, { headers: KOMIKSTATION_HEADERS });
    const html = await response.text();
    const results = [];
    const blocks = html.split(/<div[^>]*class="[^"]*bs[^"]*"/i);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/href="(https:\/\/komikstation\.org\/[^"]+)"|href="(\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/);
      const titleMatch = block.match(/title="([^"]+)"|class="[^"]*tt[^"]*"[^>]*>([^<]+)</i);
      const epMatch = block.match(/class="[^"]*epxs[^"]*"[^>]*>([^<]+)</i);
      const rateMatch = block.match(/class="[^"]*numscore[^"]*"[^>]*>([^<]+)</i);
      if (linkMatch && imgMatch) {
        const href = linkMatch[1] || linkMatch[2] || '';
        const fullUrl = href.startsWith('http') ? href : `https://komikstation.org${href}`;
        let mangaId = fullUrl.includes('/manga/') ? fullUrl.replace(/^https?:\/\/[^/]+\/manga\//, '').replace(/\/$/, '') : '';
        if (!mangaId && fullUrl.includes('-chapter-')) {
          mangaId = fullUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '').replace(/-chapter-\d+(?:\.\d+)?.*$/i, '');
        }
        if (!mangaId) mangaId = fullUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
        results.push({
          id: mangaId,
          title: decodeHtmlEntities((titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : 'Unknown')),
          image: imgMatch[1].startsWith('http') ? imgMatch[1] : `https://komikstation.org${imgMatch[1]}`,
          link: fullUrl,
          latestChapter: epMatch ? epMatch[1].trim() : '',
          rating: rateMatch ? rateMatch[1].trim() : '',
          provider: 'Komikstation',
        });
      }
    }
    const hasNextPage = html.includes(`page=${page + 1}`);
    return { currentPage: page, hasNextPage, genreId, results };
  } catch (error) {
    console.error('Komikstation genre browse error:', error);
    throw new Error(`Failed to fetch genre: ${error.message}`);
  }
}

// ============================================
// IMAGE PROXY (Fast image loading with caching)
// ============================================

// In-memory image cache for frequently accessed images
const imageCache = new Map();
const IMAGE_CACHE_DURATION = 3600000; // 1 hour
const MAX_IMAGE_CACHE_SIZE = 100; // Max cached images

function getRefererForImageUrl(imageUrl) {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    if (host.includes('mangapill') || host.includes('readdetectiveconan') || host.includes('cdn.mangapill')) {
      return 'https://mangapill.com/';
    }
    if (host.includes('komikstation') || host.includes('klikcdn')) {
      return 'https://komikstation.org/';
    }
    if (host.includes('comick') || host.includes('comicknew') || host.includes('comick.pictures')) {
      return 'https://comick.art/';
    }
  } catch (_) {}
  return 'https://mangapill.com/';
}

async function proxyImage(imageUrl, env, request = null) {
  const cors = corsHeaders(env, request?.headers?.get('Origin'));
  if (!imageUrl) {
    return new Response('Image URL is required', { status: 400, headers: cors });
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
          ...corsHeaders(env, request?.headers?.get('Origin')),
        },
      });
    }

    const referer = getRefererForImageUrl(imageUrl);
    const response = await fetch(imageUrl, {
      headers: {
        'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
      },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch image: ${response.status}`, { status: response.status, headers: cors });
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
        ...corsHeaders(env, request?.headers?.get('Origin')),
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new Response(`Image proxy error: ${error.message}`, { status: 500, headers: cors });
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

          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/manhwa/popular</span>
            </div>
            <p class="endpoint-desc">Popular manhwa from Komikstation.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/manhwa/popular')">Test: Manhwa Popular</button>
          </div>
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/manhwa/ongoing</span>
            </div>
            <p class="endpoint-desc">Ongoing manhwa updates.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/manhwa/ongoing')">Test: Manhwa Ongoing</button>
          </div>
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/manhwa/genres</span>
            </div>
            <p class="endpoint-desc">List manhwa genres.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/manhwa/genres')">Test: Manhwa Genres</button>
          </div>
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/manhwa/detail/{id}</span>
            </div>
            <p class="endpoint-desc">Get manhwa details by ID.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/manhwa/detail/solo-leveling')">Test: Manhwa Detail</button>
          </div>
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method">GET</span>
              <span class="endpoint-path">/api/v1/manhwa/search/{query}</span>
            </div>
            <p class="endpoint-desc">Search manhwa by title.</p>
            <button class="test-btn" onclick="testEndpoint('/api/v1/manhwa/search/solo')">Test: Manhwa Search</button>
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
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  
  try {
    const homeData = await mangapillHomeData();
    
    const result = {
      name: 'Emnex Manga API',
      version: '1.2.0',
      provider: 'mangapill',
      ...homeData,
      endpoints: {
        search: 'GET /api/v1/search/:query (?page=1)',
        info: 'GET /api/v1/info/:id',
        read: 'GET /api/v1/read/:chapterId',
        recent: 'GET /api/v1/recent (?page=1)',
        new: 'GET /api/v1/new (?page=1)',
        random: 'GET /api/v1/random',
        genres: 'GET /api/v1/genres',
        advancedSearch: 'GET /api/v1/advanced-search (?q=&genre=&type=&status=&page=1)',
        trending: 'GET /api/v1/trending',
        browse: 'GET /api/v1/browse (?genre=&type=&status=&page=1)',
        home: 'GET /api/v1/home',
        image: 'GET /api/v1/image?url={imageUrl}',
        manhwaPopular: 'GET /api/v1/manhwa/popular (?page=1)',
        manhwaOngoing: 'GET /api/v1/manhwa/ongoing (?page=1)',
        manhwaDetail: 'GET /api/v1/manhwa/detail/:id',
        manhwaChapter: 'GET /api/v1/manhwa/chapter/:chapterId',
        manhwaSearch: 'GET /api/v1/manhwa/search/:query (?page=1)',
        manhwaGenres: 'GET /api/v1/manhwa/genres',
        manhwaGenre: 'GET /api/v1/manhwa/genre/:genreId (?page=1)',
        comickSearch: 'GET /api/v1/comick/search/:query (?page=1)',
        comickInfo: 'GET /api/v1/comick/info/:slug',
        comickRead: 'GET /api/v1/comick/read/:chapterId',
      },
    };
    
    homeCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
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
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  
  try {
    const result = await mangaSearch(provider, query, page);
    searchCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, query, page, ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleInfo(provider, mangaId, url, env, request) {
  const cacheKey = `info:${provider}:${mangaId}`;
  const now = Date.now();
  const cached = infoCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.info) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  }
  
  try {
    const result = await mangaInfo(provider, mangaId);
    infoCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleRead(provider, chapterId, url, env, request) {
  const cacheKey = `pages:${provider}:${chapterId}`;
  const now = Date.now();
  const cached = pagesCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.pages) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
  }
  
  try {
    const result = await mangaRead(provider, chapterId);
    pagesCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider, data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
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
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  
  try {
    const result = await mangapillAdvancedSearch({ query, genre, type, status, page });
    searchCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
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
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.short });
  }
  
  try {
    const result = await mangapillRecentChapters(page);
    recentCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.short });
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
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  
  try {
    const result = await mangapillNewManga(page);
    newMangaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleRandomManga(env, request) {
  try {
    const result = await mangapillRandom();
    return jsonResponse({ status: 'success', provider: 'mangapill', data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.short });
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
  }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
}

async function handleTrending(env, request) {
  const cacheKey = 'trending';
  const now = Date.now();
  const cached = homeCache.get(cacheKey);
  
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, results: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  
  try {
    const results = await mangapillTrending();
    homeCache.set(cacheKey, { data: results, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'mangapill', results }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

// Manhwa (Komikstation) handlers
async function handleManhwaPopular(requestUrl, env, request) {
  const urlObj = new URL(requestUrl);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `manhwa_popular:${page}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  try {
    const result = await komikstationManhwaPopular(page);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaOngoing(requestUrl, env, request) {
  const urlObj = new URL(requestUrl);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `manhwa_ongoing:${page}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  try {
    const result = await komikstationManhwaOngoing(page);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaDetail(manhwaId, env, request) {
  const cacheKey = `manhwa_detail:${manhwaId}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.info) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  }
  try {
    const result = await komikstationManhwaDetail(manhwaId);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaChapter(chapterId, env, request) {
  const cacheKey = `manhwa_chapter:${chapterId}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.pages) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
  }
  try {
    const result = await komikstationManhwaChapter(chapterId);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaSearch(requestUrl, env, request) {
  const urlObj = new URL(requestUrl);
  const pathAfter = urlObj.pathname.replace(/^\/api\/v1\/manhwa\/search\//, '');
  const query = urlObj.searchParams.get('q') || decodeURIComponent(pathAfter || '');
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `manhwa_search:${query}:${page}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  try {
    const result = await komikstationManhwaSearch(query, page);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', query, ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaGenres(env, request) {
  const cacheKey = 'manhwa_genres';
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  }
  try {
    const result = await komikstationManhwaGenres();
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleComickSearch(requestUrl, env, request) {
  const urlObj = new URL(requestUrl);
  const pathAfter = urlObj.pathname.replace(/^\/api\/v1\/comick\/search\//, '').replace(/\/$/, '');
  const query = urlObj.searchParams.get('q') || decodeURIComponent(pathAfter || '');
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `comick_search:${query}:${page}`;
  const now = Date.now();
  const cached = comickCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  try {
    const result = await comickSearch(query, page);
    comickCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'comick', query, ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleComickInfo(slug, env, request) {
  const cacheKey = `comick_info:${slug}`;
  const now = Date.now();
  const cached = comickCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.info) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  }
  try {
    const result = await comickInfo(slug);
    comickCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'comick', data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.info });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleComickChapter(chapterId, env, request) {
  const cacheKey = `comick_chapter:${chapterId}`;
  const now = Date.now();
  const cached = comickCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.pages) {
    return jsonResponse({ status: 'success', cached: true, data: cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
  }
  try {
    const result = await comickChapter(chapterId);
    comickCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'comick', data: result }, 200, env, request, { cacheControl: CACHE_CONTROL.pages });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
}

async function handleManhwaGenre(genreId, requestUrl, env, request) {
  const urlObj = new URL(requestUrl);
  const page = parseInt(urlObj.searchParams.get('page')) || 1;
  const cacheKey = `manhwa_genre:${genreId}:${page}`;
  const now = Date.now();
  const cached = manhwaCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: 'success', cached: true, ...cached.data }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  }
  try {
    const result = await komikstationManhwaByGenre(genreId, page);
    manhwaCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: 'success', provider: 'komikstation', ...result }, 200, env, request, { cacheControl: CACHE_CONTROL.search });
  } catch (error) {
    return errorResponse(error.message, 500, env, request);
  }
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
    
    // Public endpoints that don't require authentication
    // - Root path (testing UI)
    // - Image proxy (browser img tags can't send custom headers)
    // - Prefetch (batch image cache warming)
    const isPublicEndpoint = url.pathname === '/' || url.pathname === '/api/v1/image' || url.pathname === '/api/proxy/prefetch';
    
    // All other API endpoints require both origin AND token validation
    if (!isPublicEndpoint) {
      const validation = validateRequest(request, env, true);
      if (!validation.valid) {
        const errorMessages = {
          origin: 'Access denied. Request origin not allowed.',
          token: 'Unauthorized access. Valid authentication required.',
        };
        return jsonResponse({
          error: 'NOTHING TO FIND HERE GO BACK',
          message: errorMessages[validation.reason] || 'Access denied.',
        }, 401, env, request);
      }
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
      
      // Advanced search (also supports browse by genre: ?genre=Isekai&type=manga&status=publishing)
      if (url.pathname === '/api/v1/advanced-search') {
        return await handleAdvancedSearch(request.url, env, request);
      }
      
      // Trending manga (popular/trending list from Mangapill home)
      if (url.pathname === '/api/v1/trending') {
        return await handleTrending(env, request);
      }
      
      // Browse by genre - alias for advanced-search with genre (e.g. ?genre=Action&page=1)
      if (url.pathname === '/api/v1/browse') {
        return await handleAdvancedSearch(request.url, env, request);
      }
      
      // Image proxy for fast image loading (supports Mangapill, Komikstation, ComicK)
      if (url.pathname === '/api/v1/image') {
        const imageUrl = url.searchParams.get('url');
        return await proxyImage(imageUrl, env, request);
      }
      
      // Prefetch: batch warm image cache (?urls=url1,url2,... - proxy URLs or raw image URLs)
      if (url.pathname === '/api/proxy/prefetch') {
        const urlsParam = url.searchParams.get('urls') || '';
        const rawUrls = urlsParam.split(',').map(u => u.trim()).filter(Boolean).slice(0, 20);
        const imageUrls = rawUrls.map(u => {
          try {
            const parsed = new URL(u);
            const img = parsed.searchParams.get('url');
            return img || (u.startsWith('http') ? u : null);
          } catch (_) { return u.startsWith('http') ? u : null; }
        }).filter(Boolean);
        await Promise.all(imageUrls.map(imgUrl => proxyImage(imgUrl, env, request)));
        return jsonResponse({ status: 'ok', count: imageUrls.length }, 200, env, request);
      }
      
      // Manhwa endpoints (Komikstation - komikstation.org)
      if (url.pathname === '/api/v1/manhwa/popular') {
        return await handleManhwaPopular(request.url, env, request);
      }
      if (url.pathname === '/api/v1/manhwa/ongoing') {
        return await handleManhwaOngoing(request.url, env, request);
      }
      if (url.pathname === '/api/v1/manhwa/genres') {
        return await handleManhwaGenres(env, request);
      }
      if (url.pathname.startsWith('/api/v1/manhwa/detail/')) {
        const manhwaId = decodeURIComponent(url.pathname.replace('/api/v1/manhwa/detail/', ''));
        return await handleManhwaDetail(manhwaId, env, request);
      }
      if (url.pathname.startsWith('/api/v1/manhwa/chapter/')) {
        const chapterId = decodeURIComponent(url.pathname.replace('/api/v1/manhwa/chapter/', ''));
        return await handleManhwaChapter(chapterId, env, request);
      }
      if (url.pathname.startsWith('/api/v1/manhwa/genre/')) {
        const parts = url.pathname.replace('/api/v1/manhwa/genre/', '').split('/');
        const genreId = decodeURIComponent(parts[0] || '');
        return await handleManhwaGenre(genreId, request.url, env, request);
      }
      if (url.pathname.startsWith('/api/v1/manhwa/search/')) {
        const searchPath = url.pathname.replace('/api/v1/manhwa/search/', '');
        const searchUrl = url.origin + '/api/v1/manhwa/search/' + searchPath + (url.search || '');
        return await handleManhwaSearch(searchUrl, env, request);
      }
      
      // ComicK endpoints (comick.art - manga/manhwa/manhua)
      if (url.pathname.startsWith('/api/v1/comick/search/')) {
        return await handleComickSearch(request.url, env, request);
      }
      if (url.pathname.startsWith('/api/v1/comick/info/')) {
        const slug = decodeURIComponent(url.pathname.replace('/api/v1/comick/info/', ''));
        return await handleComickInfo(slug, env, request);
      }
      if (url.pathname.startsWith('/api/v1/comick/read/')) {
        const chapterId = decodeURIComponent(url.pathname.replace('/api/v1/comick/read/', ''));
        return await handleComickChapter(chapterId, env, request);
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
