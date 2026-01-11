# Frontend Integration Guide

## 🔐 Authentication & CORS Setup

Your Manga API now requires authentication for production use. This guide shows you how to integrate it with your frontend applications.

## 🔑 Production Credentials

**API Secret Token:**
```
ce64c942306eeaa312863cbc415787afa99014b995f3e2fe2d8c892b91681f8f
```

**Allowed Origins:**
- `http://localhost:5173` (Local Development)
- `https://manga-reader-theta-tawny.vercel.app` (Production)

**Production API URL:**
```
https://emnex-manga-api.YOUR_WORKER_SUBDOMAIN.workers.dev
```

---

## 📦 Installation & Setup

### 1. Create API Configuration File

Create a file `src/config/api.js` (or `api.ts` for TypeScript):

```javascript
// src/config/api.js

const API_CONFIG = {
  // Change this to your actual Cloudflare Worker URL after deployment
  baseUrl: import.meta.env.VITE_API_URL || 'https://emnex-manga-api.YOUR_SUBDOMAIN.workers.dev',
  
  // The secret token for authentication
  secretToken: import.meta.env.VITE_API_SECRET || 'ce64c942306eeaa312863cbc415787afa99014b995f3e2fe2d8c892b91681f8f',
  
  // API version
  version: 'v1',
};

export default API_CONFIG;
```

### 2. Create Environment File

Create `.env` in your project root:

```env
# .env
VITE_API_URL=https://emnex-manga-api.YOUR_SUBDOMAIN.workers.dev
VITE_API_SECRET=ce64c942306eeaa312863cbc415787afa99014b995f3e2fe2d8c892b91681f8f
```

**Important:** Add `.env` to your `.gitignore` to keep secrets safe!

```gitignore
# .gitignore
.env
.env.local
.env.production
```

---

## 🛠️ API Service Implementation

### Basic API Service (JavaScript)

Create `src/services/mangaApi.js`:

```javascript
// src/services/mangaApi.js
import API_CONFIG from '../config/api';

class MangaAPI {
  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
    this.secretToken = API_CONFIG.secretToken;
    this.version = API_CONFIG.version;
  }

  /**
   * Make an authenticated request to the API
   * @param {string} endpoint - API endpoint (e.g., '/search/naruto')
   * @param {object} options - Fetch options
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api/${this.version}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Worker-Auth': this.secretToken, // Required authentication header
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Failed:', error);
      throw error;
    }
  }

  /**
   * Search for manga
   * @param {string} query - Search query
   * @param {number} page - Page number (default: 1)
   * @returns {Promise<object>}
   */
  async searchManga(query, page = 1) {
    return this.request(`/search/${encodeURIComponent(query)}?page=${page}`);
  }

  /**
   * Get manga details
   * @param {string} mangaId - Manga ID
   * @returns {Promise<object>}
   */
  async getMangaInfo(mangaId) {
    return this.request(`/info/${encodeURIComponent(mangaId)}`);
  }

  /**
   * Get chapter pages
   * @param {string} chapterId - Chapter ID
   * @returns {Promise<object>}
   */
  async getChapterPages(chapterId) {
    return this.request(`/read/${encodeURIComponent(chapterId)}`);
  }

  /**
   * Get recent chapters
   * @param {number} page - Page number (default: 1)
   * @returns {Promise<object>}
   */
  async getRecentChapters(page = 1) {
    return this.request(`/recent?page=${page}`);
  }

  /**
   * Get new manga
   * @param {number} page - Page number (default: 1)
   * @returns {Promise<object>}
   */
  async getNewManga(page = 1) {
    return this.request(`/new?page=${page}`);
  }

  /**
   * Get random manga
   * @returns {Promise<object>}
   */
  async getRandomManga() {
    return this.request('/random');
  }

  /**
   * Get available genres
   * @returns {Promise<object>}
   */
  async getGenres() {
    return this.request('/genres');
  }

  /**
   * Advanced search with filters
   * @param {object} filters - Search filters
   * @returns {Promise<object>}
   */
  async advancedSearch(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.query) params.append('q', filters.query);
    if (filters.genre) params.append('genre', filters.genre);
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.page) params.append('page', filters.page);

    return this.request(`/advanced-search?${params.toString()}`);
  }

  /**
   * Get API home data (trending, popular, etc.)
   * @returns {Promise<object>}
   */
  async getHomeData() {
    return this.request('/home');
  }

  /**
   * Get proxied image URL (for faster loading)
   * @param {string} imageUrl - Original image URL
   * @returns {string} Proxied image URL
   */
  getProxiedImageUrl(imageUrl) {
    return `${this.baseUrl}/api/${this.version}/image?url=${encodeURIComponent(imageUrl)}`;
  }
}

// Export singleton instance
const mangaApi = new MangaAPI();
export default mangaApi;
```

---

## 🎯 Usage Examples

### React Examples

#### 1. Search Component

```jsx
// src/components/SearchManga.jsx
import { useState } from 'react';
import mangaApi from '../services/mangaApi';

export default function SearchManga() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const data = await mangaApi.searchManga(query);
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manga..."
          className="search-input"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="results">
        {results.map((manga) => (
          <div key={manga.id} className="manga-card">
            <img 
              src={mangaApi.getProxiedImageUrl(manga.image)} 
              alt={manga.title} 
            />
            <h3>{manga.title}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 2. Manga Details Component

```jsx
// src/components/MangaDetails.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import mangaApi from '../services/mangaApi';

export default function MangaDetails() {
  const { mangaId } = useParams();
  const [manga, setManga] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchManga = async () => {
      try {
        const data = await mangaApi.getMangaInfo(mangaId);
        setManga(data);
      } catch (error) {
        console.error('Failed to fetch manga:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchManga();
  }, [mangaId]);

  if (loading) return <div>Loading...</div>;
  if (!manga) return <div>Manga not found</div>;

  return (
    <div className="manga-details">
      <img 
        src={mangaApi.getProxiedImageUrl(manga.image)} 
        alt={manga.title} 
      />
      <h1>{manga.title}</h1>
      <p>{manga.description}</p>
      
      <div className="chapters">
        <h2>Chapters</h2>
        {manga.chapters?.map((chapter) => (
          <div key={chapter.id}>
            <a href={`/read/${chapter.id}`}>
              {chapter.title}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 3. Chapter Reader Component

```jsx
// src/components/ChapterReader.jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import mangaApi from '../services/mangaApi';

export default function ChapterReader() {
  const { chapterId } = useParams();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPages = async () => {
      try {
        const data = await mangaApi.getChapterPages(chapterId);
        setPages(data.pages || []);
      } catch (error) {
        console.error('Failed to fetch pages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
  }, [chapterId]);

  if (loading) return <div>Loading pages...</div>;

  return (
    <div className="reader">
      {pages.map((page, index) => (
        <img
          key={index}
          src={mangaApi.getProxiedImageUrl(page.img)}
          alt={`Page ${index + 1}`}
          loading="lazy"
        />
      ))}
    </div>
  );
}
```

#### 4. Home Page with Multiple Data

```jsx
// src/pages/Home.jsx
import { useState, useEffect } from 'react';
import mangaApi from '../services/mangaApi';

export default function Home() {
  const [homeData, setHomeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const data = await mangaApi.getHomeData();
        setHomeData(data);
      } catch (error) {
        console.error('Failed to fetch home data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="home">
      {/* Trending Manga */}
      {homeData?.trending && (
        <section>
          <h2>Trending Now</h2>
          <div className="manga-grid">
            {homeData.trending.map((manga) => (
              <div key={manga.id} className="manga-card">
                <img src={mangaApi.getProxiedImageUrl(manga.image)} alt={manga.title} />
                <h3>{manga.title}</h3>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Popular Manga */}
      {homeData?.popular && (
        <section>
          <h2>Popular Manga</h2>
          <div className="manga-grid">
            {homeData.popular.map((manga) => (
              <div key={manga.id} className="manga-card">
                <img src={mangaApi.getProxiedImageUrl(manga.image)} alt={manga.title} />
                <h3>{manga.title}</h3>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

---

## 🔄 Alternative: Using Query Parameter Authentication

If you prefer, you can also authenticate using query parameters:

```javascript
// Alternative authentication method (less secure, use headers when possible)
async function searchWithQueryToken(query) {
  const url = `${API_CONFIG.baseUrl}/api/v1/search/${query}?token=${API_CONFIG.secretToken}`;
  const response = await fetch(url);
  return response.json();
}
```

**Note:** Header-based authentication (`X-Worker-Auth`) is more secure and recommended.

---

## 🚀 Deployment Steps

### Step 1: Deploy to Cloudflare Workers

```bash
# Navigate to your worker directory
cd c:\projects\worker-manga

# Deploy to production
wrangler deploy --env production
```

After deployment, you'll get your Worker URL:
```
https://emnex-manga-api.YOUR_SUBDOMAIN.workers.dev
```

### Step 2: Update Frontend Environment Variables

Update your `.env` file with the actual Worker URL:

```env
VITE_API_URL=https://emnex-manga-api.YOUR_SUBDOMAIN.workers.dev
VITE_API_SECRET=ce64c942306eeaa312863cbc415787afa99014b995f3e2fe2d8c892b91681f8f
```

### Step 3: Deploy Frontend to Vercel

```bash
# If using Vercel CLI
vercel --prod

# Or push to GitHub and let Vercel auto-deploy
```

**Don't forget to set environment variables in Vercel Dashboard:**
1. Go to Project Settings → Environment Variables
2. Add `VITE_API_URL` and `VITE_API_SECRET`
3. Redeploy

---

## 🔒 Security Best Practices

### 1. Never Commit Secrets
```gitignore
# .gitignore
.env
.env.local
.env.production
.env.*.local
wrangler.toml  # If it contains secrets
```

### 2. Use Environment Variables
Always use `import.meta.env` or `process.env` for secrets:

```javascript
// ✅ Good
const token = import.meta.env.VITE_API_SECRET;

// ❌ Bad - Never hardcode
const token = 'ce64c942306eeaa312863cbc415787afa99014b995f3e2fe2d8c892b91681f8f';
```

### 3. Rotate Tokens Periodically
Generate a new token every few months:

```powershell
# Generate new token
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
-join ($bytes | ForEach-Object { $_.ToString('x2') })
```

### 4. Use Wrangler Secrets for Production
Instead of `wrangler.toml`, use encrypted secrets:

```bash
wrangler secret put SECRET_TOKEN --env production
# Then enter your secret when prompted
```

---

## 📝 TypeScript Version

For TypeScript projects, create `src/services/mangaApi.ts`:

```typescript
// src/services/mangaApi.ts
import API_CONFIG from '../config/api';

interface MangaSearchResult {
  id: string;
  title: string;
  image: string;
  description?: string;
}

interface ApiResponse<T> {
  creator: string;
  status: string;
  results?: T;
  data?: T;
  message?: string;
}

class MangaAPI {
  private baseUrl: string;
  private secretToken: string;
  private version: string;

  constructor() {
    this.baseUrl = API_CONFIG.baseUrl;
    this.secretToken = API_CONFIG.secretToken;
    this.version = API_CONFIG.version;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}/api/${this.version}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Worker-Auth': this.secretToken,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  async searchManga(query: string, page: number = 1): Promise<ApiResponse<MangaSearchResult[]>> {
    return this.request(`/search/${encodeURIComponent(query)}?page=${page}`);
  }

  // Add other methods with proper typing...
}

export default new MangaAPI();
```

---

## 🧪 Testing Your Integration

### Quick Test Script

```javascript
// test-api.js
import mangaApi from './src/services/mangaApi';

async function testAPI() {
  try {
    console.log('Testing API connection...');
    
    // Test search
    const searchResults = await mangaApi.searchManga('naruto');
    console.log('✅ Search works:', searchResults.results?.length, 'results');
    
    // Test home data
    const homeData = await mangaApi.getHomeData();
    console.log('✅ Home data works:', homeData);
    
    console.log('All tests passed! 🎉');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAPI();
```

---

## 📞 Support & Troubleshooting

### Common Issues

#### 1. CORS Errors
**Error:** "Access to fetch blocked by CORS policy"

**Solution:** Make sure your frontend origin is in the allowed list:
- `http://localhost:5173`
- `https://manga-reader-theta-tawny.vercel.app`

#### 2. Unauthorized (401)
**Error:** "Unauthorized access"

**Solution:** Verify `X-Worker-Auth` header is being sent with the correct token.

#### 3. Environment Variables Not Working
**Error:** `undefined` API URL or token

**Solution:** 
- Restart dev server after changing `.env`
- Make sure variables start with `VITE_` prefix
- Check Vercel environment variables are set

---

## 📚 API Endpoints Reference

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/search/:query` | GET | Search manga | Yes |
| `/api/v1/info/:id` | GET | Get manga details | Yes |
| `/api/v1/read/:chapterId` | GET | Get chapter pages | Yes |
| `/api/v1/recent` | GET | Recent chapters | No |
| `/api/v1/new` | GET | New manga | No |
| `/api/v1/random` | GET | Random manga | No |
| `/api/v1/genres` | GET | Available genres | No |
| `/api/v1/advanced-search` | GET | Advanced search | Yes |
| `/api/v1/home` | GET | Home page data | No |
| `/api/v1/image` | GET | Proxy images | Yes |

---

## 🎨 Complete React App Example

Check out `FRONTEND_GUIDE.md` for a complete React application example with routing, state management, and best practices.

---

**Created by:** emnextech  
**API Version:** 1.2.0  
**Last Updated:** January 2026
