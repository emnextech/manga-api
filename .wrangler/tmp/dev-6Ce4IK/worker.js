var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-CpLQQW/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-CpLQQW/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// worker.js
var CACHE_DURATIONS = {
  search: 3e5,
  // 5 minutes
  info: 18e5,
  // 30 minutes
  chapters: 9e5,
  // 15 minutes
  pages: 36e5
  // 1 hour
};
var searchCache = /* @__PURE__ */ new Map();
var infoCache = /* @__PURE__ */ new Map();
var pagesCache = /* @__PURE__ */ new Map();
var PROVIDERS = {
  MANGADEX: {
    name: "MangaDex",
    baseUrl: "https://mangadex.org",
    id: "mangadex",
    status: "active"
  },
  MANGAPILL: {
    name: "MangaPill",
    baseUrl: "https://mangapill.com",
    id: "mangapill",
    status: "active"
  }
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
var DEFAULT_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Cache-Control": "no-cache"
};
function corsHeaders(env) {
  const allowedOrigin = env?.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "X-Worker-Auth, Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env)
    }
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status = 500, env = {}) {
  return jsonResponse({
    status: "error",
    message
  }, status, env);
}
__name(errorResponse, "errorResponse");
function validateRequest(request, env, allowQueryToken = false) {
  if (!env.SECRET_TOKEN) {
    return true;
  }
  const authHeader = request.headers.get("X-Worker-Auth");
  if (authHeader === env.SECRET_TOKEN) {
    return true;
  }
  if (allowQueryToken) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken === env.SECRET_TOKEN) {
      return true;
    }
  }
  return false;
}
__name(validateRequest, "validateRequest");
function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}
__name(stripHtmlTags, "stripHtmlTags");
function decodeHtmlEntities(text) {
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
    "&#x27;": "'",
    "&#x2F;": "/",
    "&#8217;": "'",
    "&#8220;": '"',
    "&#8221;": '"',
    "&#8211;": "-",
    "&#8212;": "\u2014"
  };
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}
__name(decodeHtmlEntities, "decodeHtmlEntities");
function extractAllMatches(html, regex) {
  const matches = [];
  let match;
  const globalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((match = globalRegex.exec(html)) !== null) {
    matches.push(match);
  }
  return matches;
}
__name(extractAllMatches, "extractAllMatches");
async function mangapillSearch(query, page = 1) {
  const url = `https://mangapill.com/search?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    const results = [];
    const mangaPattern = /<a\s+href="\/manga\/([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<div[^>]*>([^<]+)<\/div>/gi;
    let match;
    while ((match = mangaPattern.exec(html)) !== null) {
      const id = match[1];
      const image = match[2].startsWith("http") ? match[2] : `https://mangapill.com${match[2]}`;
      const title = decodeHtmlEntities(match[3].trim());
      results.push({
        id,
        title,
        image,
        url: `https://mangapill.com/manga/${id}`,
        provider: "MangaPill"
      });
    }
    return {
      currentPage: page,
      hasNextPage: false,
      results
    };
  } catch (error) {
    console.error("MangaPill search error:", error);
    throw new Error(`Search failed: ${error.message}`);
  }
}
__name(mangapillSearch, "mangapillSearch");
async function mangapillInfo(mangaId) {
  const url = `https://mangapill.com/manga/${mangaId}`;
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : mangaId;
    const imageMatch = html.match(/<img[^>]*src="(https:\/\/cdn[^"]+)"[^>]*\/>/i);
    const image = imageMatch ? imageMatch[1] : null;
    const descMatch = html.match(/<p[^>]*class="[^"]*text--secondary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripHtmlTags(descMatch[1]).trim() : "";
    const genreMatches = extractAllMatches(html, /<a[^>]*href="\/search\?genre=[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres = genreMatches.map((m) => decodeHtmlEntities(m[1]));
    const statusMatch = html.match(/Status[^<]*<[^>]*>([^<]+)<\/a>/i) || html.match(/Ongoing|Completed|Hiatus/i);
    const status = statusMatch ? (statusMatch[1] || statusMatch[0]).trim().toUpperCase() : "UNKNOWN";
    const chapters = [];
    const chapterPattern = /<a[^>]*href="\/chapters\/([^\/"]+\/[^"]+)"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/a>/gi;
    let chapterMatch;
    while ((chapterMatch = chapterPattern.exec(html)) !== null) {
      const chapterId = chapterMatch[1];
      const chapterTitle = chapterMatch[2].trim() || chapterMatch[3].trim();
      const chapterText = chapterMatch[3].trim();
      const numMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapterNumber = numMatch ? numMatch[1] : "Unknown";
      chapters.push({
        id: chapterId,
        title: chapterTitle || chapterText,
        chapterNumber
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
      provider: "MangaPill"
    };
  } catch (error) {
    console.error("MangaPill info error:", error);
    throw new Error(`Failed to fetch manga info: ${error.message}`);
  }
}
__name(mangapillInfo, "mangapillInfo");
async function mangapillRead(chapterId) {
  const url = `https://mangapill.com/chapters/${chapterId}`;
  try {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    const html = await response.text();
    const pages = [];
    const pagePattern = /<img[^>]*class="js-page"[^>]*data-src="([^"]+)"/gi;
    let match;
    while ((match = pagePattern.exec(html)) !== null) {
      const img = match[1];
      pages.push({
        page: pages.length + 1,
        img
      });
    }
    return pages;
  } catch (error) {
    console.error("MangaPill read error:", error);
    throw new Error(`Failed to fetch chapter pages: ${error.message}`);
  }
}
__name(mangapillRead, "mangapillRead");
async function mangadexSearch(query, page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist`;
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("MangaDex returned non-JSON response:", text.substring(0, 200));
      throw new Error("MangaDex API returned invalid response (possibly rate limited)");
    }
    if (data.result === "error") {
      throw new Error(data.errors?.[0]?.detail || "MangaDex API error");
    }
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Unexpected response format from MangaDex API");
    }
    const results = data.data.map((manga) => {
      const coverArt = manga.relationships.find((r) => r.type === "cover_art");
      const coverFileName = coverArt?.attributes?.fileName;
      const image = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;
      return {
        id: manga.id,
        title: manga.attributes.title.en || Object.values(manga.attributes.title)[0],
        altTitles: manga.attributes.altTitles,
        description: manga.attributes.description?.en || "",
        image,
        url: `https://mangadex.org/title/${manga.id}`,
        provider: "MangaDex"
      };
    });
    return {
      currentPage: page,
      hasNextPage: data.total > offset + limit,
      results
    };
  } catch (error) {
    console.error("MangaDex search error:", error);
    throw new Error(`MangaDex search failed: ${error.message}`);
  }
}
__name(mangadexSearch, "mangadexSearch");
async function mangadexInfo(mangaId) {
  const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("MangaDex API returned invalid response");
    }
    if (data.result === "error") {
      throw new Error(data.errors?.[0]?.detail || "MangaDex API error");
    }
    const manga = data.data;
    const coverArt = manga.relationships.find((r) => r.type === "cover_art");
    const coverFileName = coverArt?.attributes?.fileName;
    const image = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;
    const chaptersUrl = `https://api.mangadex.org/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc`;
    const chaptersResponse = await fetch(chaptersUrl, { headers: { "Accept": "application/json" } });
    const chaptersData = await chaptersResponse.json();
    const chapters = chaptersData.data.map((ch) => ({
      id: ch.id,
      title: ch.attributes.title || `Chapter ${ch.attributes.chapter}`,
      chapterNumber: ch.attributes.chapter,
      volume: ch.attributes.volume,
      pages: ch.attributes.pages
    }));
    return {
      id: manga.id,
      title: manga.attributes.title.en || Object.values(manga.attributes.title)[0],
      altTitles: manga.attributes.altTitles,
      description: manga.attributes.description?.en || "",
      image,
      status: manga.attributes.status?.toUpperCase() || "UNKNOWN",
      genres: manga.attributes.tags.map((t) => t.attributes.name.en),
      chapters,
      totalChapters: chapters.length,
      url: `https://mangadex.org/title/${manga.id}`,
      provider: "MangaDex"
    };
  } catch (error) {
    console.error("MangaDex info error:", error);
    throw new Error(`Failed to fetch manga info: ${error.message}`);
  }
}
__name(mangadexInfo, "mangadexInfo");
async function mangadexRead(chapterId) {
  const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      throw new Error(`MangaDex API returned ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("MangaDex API returned invalid response");
    }
    const baseUrl = data.baseUrl;
    const hash = data.chapter.hash;
    const pages = data.chapter.data.map((filename, index) => ({
      page: index + 1,
      img: `${baseUrl}/data/${hash}/${filename}`
    }));
    return pages;
  } catch (error) {
    console.error("MangaDex read error:", error);
    throw new Error(`Failed to fetch chapter pages: ${error.message}`);
  }
}
__name(mangadexRead, "mangadexRead");
async function mangaSearch(provider, query, page = 1) {
  switch (provider) {
    case "mangadex":
      return await mangadexSearch(query, page);
    case "mangapill":
      return await mangapillSearch(query, page);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}
__name(mangaSearch, "mangaSearch");
async function mangaInfo(provider, id) {
  switch (provider) {
    case "mangadex":
      return await mangadexInfo(id);
    case "mangapill":
      return await mangapillInfo(id);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}
__name(mangaInfo, "mangaInfo");
async function mangaRead(provider, chapterId) {
  switch (provider) {
    case "mangadex":
      return await mangadexRead(chapterId);
    case "mangapill":
      return await mangapillRead(chapterId);
    default:
      throw new Error(`Provider '${provider}' is not supported or not yet implemented`);
  }
}
__name(mangaRead, "mangaRead");
async function handleHome(env) {
  return jsonResponse({
    status: "success",
    name: "Emnex Manga Worker API",
    version: "1.0.0",
    description: "A Cloudflare Worker API for manga content from multiple providers",
    documentation: "https://github.com/consumet/api.consumet.org",
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl
    })),
    endpoints: {
      providers: "GET /api/providers - List all available providers",
      search: "GET /api/:provider/search/:query?page=1 - Search manga by query",
      info: "GET /api/:provider/info/:id - Get manga information and chapters",
      read: "GET /api/:provider/read/:chapterId - Get chapter pages"
    },
    examples: {
      search: `/api/mangadex/search/naruto`,
      searchWithPage: `/api/mangadex/search/one piece?page=2`,
      info: `/api/mangapill/info/manga-jk939454`,
      read: `/api/mangadex/read/chapter-id-here`
    }
  }, 200, env);
}
__name(handleHome, "handleHome");
async function handleProviders(env) {
  return jsonResponse({
    status: "success",
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      endpoints: [
        `GET /api/${p.id}/search/:query`,
        `GET /api/${p.id}/info/:id`,
        `GET /api/${p.id}/read/:chapterId`
      ]
    }))
  }, 200, env);
}
__name(handleProviders, "handleProviders");
async function handleSearch(provider, query, url, env) {
  const urlObj = new URL(url);
  const page = parseInt(urlObj.searchParams.get("page")) || 1;
  const cacheKey = `search:${provider}:${query}:${page}`;
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.search) {
    return jsonResponse({ status: "success", cached: true, ...cached.data }, 200, env);
  }
  try {
    const result = await mangaSearch(provider, query, page);
    searchCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: "success", provider, query, page, ...result }, 200, env);
  } catch (error) {
    return errorResponse(error.message, 500, env);
  }
}
__name(handleSearch, "handleSearch");
async function handleInfo(provider, mangaId, url, env) {
  const cacheKey = `info:${provider}:${mangaId}`;
  const now = Date.now();
  const cached = infoCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.info) {
    return jsonResponse({ status: "success", cached: true, data: cached.data }, 200, env);
  }
  try {
    const result = await mangaInfo(provider, mangaId);
    infoCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: "success", provider, data: result }, 200, env);
  } catch (error) {
    return errorResponse(error.message, 500, env);
  }
}
__name(handleInfo, "handleInfo");
async function handleRead(provider, chapterId, url, env) {
  const cacheKey = `pages:${provider}:${chapterId}`;
  const now = Date.now();
  const cached = pagesCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_DURATIONS.pages) {
    return jsonResponse({ status: "success", cached: true, data: cached.data }, 200, env);
  }
  try {
    const result = await mangaRead(provider, chapterId);
    pagesCache.set(cacheKey, { data: result, timestamp: now });
    return jsonResponse({ status: "success", provider, data: result }, 200, env);
  } catch (error) {
    return errorResponse(error.message, 500, env);
  }
}
__name(handleRead, "handleRead");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }
    const publicEndpoints = ["/", "/api/providers"];
    const isPublic = publicEndpoints.includes(url.pathname);
    if (!isPublic && !validateRequest(request, env)) {
      return errorResponse("Unauthorized access", 401, env);
    }
    try {
      if (url.pathname === "/") {
        return await handleHome(env);
      }
      if (url.pathname === "/api/providers") {
        return await handleProviders(env);
      }
      const pathMatch = url.pathname.match(/^\/api\/([^\/]+)\/([^\/]+)\/(.+)$/);
      if (!pathMatch) {
        return errorResponse("Invalid endpoint format. Use: /api/:provider/:action/:id", 404, env);
      }
      const [, provider, action, param] = pathMatch;
      const validProviders = Object.values(PROVIDERS).map((p) => p.id);
      if (!validProviders.includes(provider)) {
        return errorResponse(
          `Invalid provider: ${provider}. Valid providers: ${validProviders.join(", ")}`,
          400,
          env
        );
      }
      if (action === "search") {
        const query = decodeURIComponent(param);
        if (!query)
          return errorResponse("Search query is required", 400, env);
        return await handleSearch(provider, query, request.url, env);
      }
      if (action === "info") {
        const mangaId = decodeURIComponent(param);
        if (!mangaId)
          return errorResponse("Manga ID is required", 400, env);
        return await handleInfo(provider, mangaId, request.url, env);
      }
      if (action === "read") {
        const chapterId = decodeURIComponent(param);
        if (!chapterId)
          return errorResponse("Chapter ID is required", 400, env);
        return await handleRead(provider, chapterId, request.url, env);
      }
      return errorResponse(`Invalid action: ${action}. Valid actions: search, info, read`, 400, env);
    } catch (error) {
      console.error("Worker error:", error);
      return errorResponse(`Internal server error: ${error.message}`, 500, env);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-CpLQQW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-CpLQQW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
