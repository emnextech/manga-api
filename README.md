# Emnex Manga Worker API

A **Cloudflare Worker** that provides a fast, scalable REST API for manga content.

> **Creator**: emnextech  
> **Version**: 1.2.0

## 🌟 Features

- **13 API Endpoints**: Search, info, read, recent, new, random, genres, advanced search, trending, browse, home, image proxy
- **Fast Response**: In-memory caching with configurable TTL
- **Image Proxy**: Cached image loading with 24h browser cache headers
- **CORS Enabled**: Ready for web applications
- **Direct Scraping**: No external API dependencies
- **RESTful Design**: Clean, intuitive `/api/v1/` routes

## 📋 API Endpoints

All endpoints return JSON with `creator: "emnextech"` field.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | HTML home page with testing buttons |
| `GET` | `/api/v1/home` | Home data: featured chapters, trending manga |
| `GET` | `/api/v1/search/:query` | Search manga by title |
| `GET` | `/api/v1/info/:id` | Get manga details and chapters |
| `GET` | `/api/v1/read/:chapterId` | Get chapter page images |
| `GET` | `/api/v1/recent` | Recent chapter updates |
| `GET` | `/api/v1/new` | Newly added manga |
| `GET` | `/api/v1/random` | Get a random manga |
| `GET` | `/api/v1/genres` | Available genres, types, statuses |
| `GET` | `/api/v1/advanced-search` | Search with filters (?q=&genre=&type=&status=&page=1) |
| `GET` | `/api/v1/trending` | Trending/popular manga from Mangapill home |
| `GET` | `/api/v1/browse` | Browse by genre (?genre=&type=&status=&page=1) |
| `GET` | `/api/v1/image?url=...` | Image proxy with caching |

### Manhwa Endpoints (Komikstation - komikstation.org)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/manhwa/popular` | Popular manhwa list (?page=1) |
| `GET` | `/api/v1/manhwa/ongoing` | Ongoing manhwa (?page=1) |
| `GET` | `/api/v1/manhwa/detail/:id` | Manhwa detail with chapters |
| `GET` | `/api/v1/manhwa/chapter/:chapterId` | Chapter page images (e.g. nano-machine-chapter-1) |
| `GET` | `/api/v1/manhwa/search/:query` | Search manhwa (?page=1) |
| `GET` | `/api/v1/manhwa/genres` | Available genres |
| `GET` | `/api/v1/manhwa/genre/:genreId` | Manhwa by genre (?page=1) |

### ComicK Endpoints (comick.art - manga/manhwa/manhua)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/comick/search/:query` | Search manga/manhwa/manhua (?page=1) |
| `GET` | `/api/v1/comick/info/:slug` | Comic detail with chapters |
| `GET` | `/api/v1/comick/read/:chapterId` | Chapter page images |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account (for deployment)

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# or
wrangler dev --port 8788
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
# or
wrangler deploy
```

## 📖 API Documentation

### 1. Home Data

```
GET /api/v1/home
```

Returns featured chapters, trending manga, and API information.

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "name": "Emnex Manga API",
  "version": "1.2.0",
  "provider": "mangapill",
  "featuredChapters": [
    {
      "chapterId": "1234-10050000/manga-chapter-50",
      "chapterNumber": "50",
      "mangaId": "1234/manga-name",
      "mangaTitle": "Manga Name",
      "image": "https://cdn..."
    }
  ],
  "trendingManga": [
    {
      "id": "6/berserk",
      "title": "Berserk",
      "image": "https://cdn..."
    }
  ],
  "endpoints": { ... }
}
```

### 2. Search Manga

```
GET /api/v1/search/:query
GET /api/v1/search/:query?page=2
```

**Parameters:**
- `query` (required): Search term (URL encoded)
- `page` (optional): Page number (default: 1)

**Test Examples:**
```
/api/v1/search/naruto
/api/v1/search/one%20piece
/api/v1/search/demon%20slayer?page=1
```

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "provider": "mangapill",
  "query": "naruto",
  "currentPage": 1,
  "hasNextPage": false,
  "results": [
    {
      "id": "27/naruto",
      "title": "Naruto",
      "image": "https://cdn...",
      "url": "https://mangapill.com/manga/27/naruto",
      "provider": "MangaPill"
    }
  ]
}
```

### 3. Manga Info

```
GET /api/v1/info/:id
```

**Parameters:**
- `id` (required): Manga ID from search results

**Test Examples:**
```
/api/v1/info/2/one-piece
/api/v1/info/27/naruto
/api/v1/info/6/berserk
```

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "provider": "mangapill",
  "data": {
    "id": "2/one-piece",
    "title": "One Piece",
    "image": "https://cdn...",
    "description": "...",
    "genres": ["Action", "Adventure", "Comedy"],
    "status": "ONGOING",
    "chapters": [
      {
        "id": "2-11350000/one-piece-chapter-1135",
        "title": "Chapter 1135",
        "chapterNumber": "1135"
      }
    ],
    "totalChapters": 1135
  }
}
```

### 4. Read Chapter

```
GET /api/v1/read/:chapterId
```

**Parameters:**
- `chapterId` (required): Chapter ID from manga info

**Test Examples:**
```
/api/v1/read/2-10001000/one-piece-chapter-1
/api/v1/read/27-10001000/naruto-chapter-1
```

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "provider": "mangapill",
  "data": [
    { "page": 1, "img": "https://cdn.../1.jpeg" },
    { "page": 2, "img": "https://cdn.../2.jpeg" }
  ]
}
```

### 5. Recent Updates

```
GET /api/v1/recent
GET /api/v1/recent?page=2
```

Returns recently updated chapters.

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "currentPage": 1,
  "hasNextPage": true,
  "results": [
    {
      "chapterId": "1234-10500000/manga-chapter-50",
      "chapterTitle": "Manga Chapter 50",
      "chapterNumber": "50",
      "mangaId": "1234/manga-name",
      "mangaTitle": "Manga Name",
      "image": "https://cdn..."
    }
  ]
}
```

### 6. New Manga

```
GET /api/v1/new
GET /api/v1/new?page=2
```

Returns newly added manga.

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "currentPage": 1,
  "hasNextPage": true,
  "results": [
    {
      "id": "12345/new-manga",
      "title": "New Manga",
      "image": "https://cdn...",
      "provider": "MangaPill"
    }
  ]
}
```

### 7. Random Manga

```
GET /api/v1/random
```

Returns a random manga with full details.

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "data": {
    "id": "random-id/random-manga",
    "title": "Random Manga",
    "image": "https://cdn...",
    "description": "...",
    "genres": ["Action", "Adventure"]
  }
}
```

### 8. Genres & Filters

```
GET /api/v1/genres
```

Returns available genres, types, and statuses for filtering.

**Response:**
```json
{
  "creator": "emnextech",
  "status": "success",
  "genres": ["Action", "Adventure", "Comedy", ...],
  "types": ["manga", "manhwa", "manhua", ...],
  "statuses": ["publishing", "finished", "on hiatus", ...]
}
```

### 9. Advanced Search

```
GET /api/v1/advanced-search?q=...&genre=...&type=...&status=...&page=...
```

**Parameters (all optional):**
- `q`: Search query
- `genre`: Filter by genre (e.g., `Action`)
- `type`: Filter by type (e.g., `manhwa`)
- `status`: Filter by status (e.g., `publishing`)
- `page`: Page number

**Test Examples:**
```
/api/v1/advanced-search?genre=Action
/api/v1/advanced-search?type=manhwa&status=publishing
/api/v1/advanced-search?q=sword&genre=Fantasy
```

### 10. Image Proxy

```
GET /api/v1/image?url={imageUrl}
```

Proxies images with caching for faster loading.

**Features:**
- In-memory cache (1 hour TTL)
- Browser cache headers (24 hours)
- CORS enabled
- Returns `X-Cache: HIT` or `X-Cache: MISS` header

**Test Example:**
```
/api/v1/image?url=https://cdn.readdetectiveconan.com/file/mangapill/i/6422.jpeg
```

## ⚡ Caching

| Data Type | Cache Duration |
|-----------|---------------|
| Search results | 5 minutes |
| Manga info | 30 minutes |
| Chapter pages | 1 hour |
| Recent updates | 3 minutes |
| New manga | 10 minutes |
| Home data | 5 minutes |
| Images | 1 hour (memory) + 24h (browser) |

Cached responses include `"cached": true` in the JSON.

## 🔒 Authentication (Optional)

Set `SECRET_TOKEN` in `wrangler.toml`:

```toml
[vars]
SECRET_TOKEN = "your-secret-token"
```

Include token in requests:
```
Header: X-Worker-Auth: your-secret-token
Query:  ?token=your-secret-token
```

## ⚙️ Configuration

### wrangler.toml

```toml
name = "manga-worker"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "*"

[dev]
port = 8788
```

### Cache Durations

Edit `worker.js` to adjust:

```javascript
const CACHE_DURATIONS = {
  search: 300000,      // 5 minutes
  info: 1800000,       // 30 minutes
  chapters: 900000,    // 15 minutes
  pages: 3600000,      // 1 hour
  recent: 180000,      // 3 minutes
  new: 600000,         // 10 minutes
};
```

## 🧪 Testing

### Using the HTML Interface

Visit the root URL `/` to access the built-in testing interface with buttons for each endpoint.

### Using curl

```bash
# Test home endpoint
curl -s "/api/v1/home" | jq '.status, .featuredCount, .trendingCount'

# Test search
curl -s "/api/v1/search/naruto" | jq '.results[0]'

# Test manga info
curl -s "/api/v1/info/2/one-piece" | jq '.data.title, .data.totalChapters'

# Test chapter read
curl -s "/api/v1/read/2-10001000/one-piece-chapter-1" | jq '.data | length'

# Test image proxy
curl -s "/api/v1/image?url=https://cdn.example.com/image.jpg" -o image.jpg
```

### Test Script

Run the included test script:

```bash
npm test
# or
node test-endpoints.js
```

## 🐛 Troubleshooting

### Worker not starting

```bash
rm -rf .wrangler
npm run dev
```

### CORS errors

Update `ALLOWED_ORIGIN` in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourdomain.com"
```

### Rate limiting

The API includes in-memory caching to reduce requests to the source. If you're still hitting rate limits, increase cache durations.

## 📄 License

MIT License

## 🙏 Credits

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)


---

**Made with ❤️ by emnextech**
