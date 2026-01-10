# Emnex Manga Worker API

A **Cloudflare Worker** that provides a fast, scalable API for manga content using direct web scraping.

## 🌟 Features

- **Multiple Providers**: MangaPill (primary), MangaDex (API-based)
- **Fast Response**: In-memory caching with configurable TTL
- **CORS Enabled**: Ready for web applications
- **Secure**: Optional token-based authentication
- **RESTful**: Clean, intuitive API design
- **Direct Scraping**: No external API dependencies for MangaPill
- **Error Handling**: Comprehensive error messages

## 📋 Supported Providers

| Provider | ID | Status | Notes |
|----------|-------|--------|-------|
| MangaPill | `mangapill` | ✅ Active | Primary provider, direct scraping |
| MangaDex | `mangadex` | ⚠️ Limited | May be rate-limited |

## ⚡ Quick Examples

```bash
# Search for manga
curl "http://127.0.0.1:8788/api/mangapill/search/one%20piece"

# Get manga info (returns all chapters)
curl "http://127.0.0.1:8788/api/mangapill/info/2/one-piece"

# Read a chapter (returns all page images)
curl "http://127.0.0.1:8788/api/mangapill/read/2-10001000/one-piece-chapter-1"
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (for deployment)

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   
  The worker will be available at `http://127.0.0.1:8788`

3. **Run tests**:
   ```bash
   npm test
   ```

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## 📖 API Documentation

### Base URL

- **Local**: `http://127.0.0.1:8788`
- **Production**: `https://your-worker.your-subdomain.workers.dev`

### Endpoints

#### 1. **Home / API Info**

```http
GET /
```

Returns API information, available providers, and endpoint documentation.

**Response**:
```json
{
  "status": "success",
  "name": "Emnex Manga Worker API",
  "version": "1.0.0",
  "providers": [...],
  "endpoints": {...}
}
```

#### 2. **List Providers**

```http
GET /api/providers
```

Returns all available manga providers.

**Response**:
```json
{
  "status": "success",
  "providers": [
    {
      "id": "mangadex",
      "name": "MangaDex",
      "baseUrl": "https://mangadex.org",
      "endpoints": [...]
    }
  ]
}
```

#### 3. **Search Manga**

```http
GET /api/:provider/search/:query?page=1
```

Search for manga by title.

**Parameters**:
- `provider` (required): Provider ID (`mangapill` recommended, `mangadex` available)
- `query` (required): Search query (URL encoded)
- `page` (optional): Page number (default: 1)

**Examples**:
```bash
# Search for One Piece
curl "http://127.0.0.1:8788/api/mangapill/search/one%20piece"

# Search for Demon Slayer
curl "http://127.0.0.1:8788/api/mangapill/search/kimetsu"

# Search for Naruto
curl "http://127.0.0.1:8788/api/mangapill/search/naruto"
```

**Response**:
```json
{
  "status": "success",
  "provider": "mangapill",
  "query": "one piece",
  "page": 1,
  "currentPage": 1,
  "hasNextPage": false,
  "results": [
    {
      "id": "2/one-piece",
      "title": "One Piece",
      "image": "https://cdn.mangapill.com/...",
      "url": "https://mangapill.com/manga/2/one-piece",
      "provider": "MangaPill"
    }
  ]
}
```

#### 4. **Get Manga Info**

```http
GET /api/:provider/info/:id
```

Get detailed information about a specific manga, including all chapters.

**Parameters**:
- `provider` (required): Provider ID
- `id` (required): Manga ID (from search results)

**Examples**:
```bash
# Get One Piece info (1186 chapters)
curl "http://127.0.0.1:8788/api/mangapill/info/2/one-piece"

# Get Demon Slayer info (205 chapters)
curl "http://127.0.0.1:8788/api/mangapill/info/2285/kimetsu-no-yaiba"

# Get Attack on Titan info
curl "http://127.0.0.1:8788/api/mangapill/info/5/shingeki-no-kyojin"
```

**Response**:
```json
{
  "status": "success",
  "provider": "mangapill",
  "data": {
    "id": "2/one-piece",
    "title": "One Piece",
    "url": "https://mangapill.com/manga/2/one-piece",
    "image": "https://cdn.mangapill.com/...",
    "description": "Gol D. Roger was known as the Pirate King...",
    "genres": ["Action", "Adventure", "Comedy", "Fantasy", "Shounen"],
    "status": "ONGOING",
    "chapters": [
      {
        "id": "2-11170000/one-piece-chapter-1170",
        "title": "Chapter 1170",
        "chapterNumber": "1170"
      }
    ],
    "totalChapters": 1186,
    "provider": "MangaPill"
  }
}
```

#### 5. **Read Chapter**

```http
GET /api/:provider/read/:chapterId
```

Get all pages for a specific chapter.

**Parameters**:
- `provider` (required): Provider ID
- `chapterId` (required): Chapter ID (from manga info chapters list)

**Examples**:
```bash
# Read One Piece Chapter 1 (57 pages)
curl "http://127.0.0.1:8788/api/mangapill/read/2-10001000/one-piece-chapter-1"

# Read Demon Slayer Chapter 1 (60 pages)
curl "http://127.0.0.1:8788/api/mangapill/read/2285-10001000/kimetsu-no-yaiba-chapter-1"

# Read latest One Piece chapter
curl "http://127.0.0.1:8788/api/mangapill/read/2-11170000/one-piece-chapter-1170"
```

**Response**:
```json
{
  "status": "success",
  "provider": "mangapill",
  "data": [
    {
      "page": 1,
      "img": "https://cdn.readdetectiveconan.com/file/mangap/2/10001000/1.jpeg"
    },
    {
      "page": 2,
      "img": "https://cdn.readdetectiveconan.com/file/mangap/2/10001000/2.jpeg"
    }
  ]
}
```

## 🔒 Authentication (Optional)

To enable authentication, set the `SECRET_TOKEN` in your `wrangler.toml`:

```toml
[vars]
SECRET_TOKEN = "your-secret-token-here"
```

Then include the token in requests:

**Header**:
```http
X-Worker-Auth: your-secret-token-here
```

**Query Parameter**:
```http
GET /api/mangadex/search/naruto?token=your-secret-token-here
```

## ⚡ Caching

The worker implements in-memory caching with the following durations:

- **Search results**: 5 minutes
- **Manga info**: 30 minutes
- **Chapters**: 15 minutes
- **Pages**: 1 hour

Cached responses include a `"cached": true` field in the JSON response.

## 🧪 Testing

The test suite covers all endpoints:

```bash
# Test local development
npm test

# Test production
API_URL=https://your-worker.workers.dev npm test
```

**Test coverage**:
- ✅ Home endpoint
- ✅ Providers list
- ✅ Search functionality (MangaPill)
- ✅ Pagination
- ✅ Manga info with chapters
- ✅ Chapter reading with pages
- ✅ Caching functionality
- ✅ Error handling
- ✅ CORS headers

## 🛠️ Configuration

### Environment Variables

Edit `wrangler.toml` to configure:

```toml
[vars]
ALLOWED_ORIGIN = "*"              # CORS origin (use specific domain in production)
# SECRET_TOKEN = "your-token"     # Optional authentication

[dev]
port = 8788                       # Local dev server port
```

### Cache Durations

Edit `worker.js` to adjust cache times:

```javascript
const CACHE_DURATIONS = {
  search: 300000,      // 5 minutes
  info: 1800000,       // 30 minutes
  chapters: 900000,    // 15 minutes
  pages: 3600000,      // 1 hour
};
```

## 📚 Provider-Specific Notes

### MangaPill (Recommended)
- **Status**: ✅ Fully working
- **Method**: Direct HTML scraping
- **ID Format**: `{number}/{slug}` (e.g., `2/one-piece`, `2285/kimetsu-no-yaiba`)
- **Chapter ID Format**: `{mangaId}-{chapterId}/{slug}` (e.g., `2-10001000/one-piece-chapter-1`)
- **Features**: Fast search, all chapters, high-quality images

### MangaDex
- **Status**: ⚠️ May be rate-limited
- **Method**: Official API
- **ID Format**: UUID (e.g., `b8794be7-8b1f-4ab3-b091-587f0f8831be`)
- **Note**: External API may return errors during high traffic

## 🐛 Troubleshooting

### Worker not starting

```bash
# Clear cache and restart
rm -rf .wrangler
npm run dev
```

### Tests failing

1. Ensure worker is running: `npm run dev`
2. Check if port 8788 is available
3. Update test IDs in `test-endpoints.js` if manga IDs have changed

### CORS errors

Update `ALLOWED_ORIGIN` in `wrangler.toml` to your domain:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourdomain.com"
```

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check the [Consumet API documentation](https://docs.consumet.org)

## 🙏 Credits

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- Manga sources: MangaPill, MangaDex

---

**Made with ❤️ by Emnex Tech**
