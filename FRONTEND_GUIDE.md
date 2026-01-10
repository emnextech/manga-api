# Building a React + TypeScript Manga Reader

A guide to building a manga reading website that integrates with the **Emnex Manga Worker API**.

> **Creator**: emnextech  
> **API Version**: 1.2.0

## 🏗️ Project Setup

```bash
# Create React + TypeScript project with Vite
npm create vite@latest manga-reader -- --template react-ts
cd manga-reader
npm install

# Install dependencies
npm install react-router-dom @tanstack/react-query axios zustand
npm install -D tailwindcss postcss autoprefixer @types/node
npx tailwindcss init -p
```

## 📁 Project Structure

```
src/
├── api/
│   └── mangaApi.ts         # API client
├── components/
│   ├── MangaCard.tsx       # Manga display card
│   ├── ChapterList.tsx     # Chapter listing
│   ├── Reader.tsx          # Page reader
│   ├── LazyImage.tsx       # Optimized image component
│   └── SearchBar.tsx       # Search input
├── hooks/
│   └── useManga.ts         # React Query hooks
├── pages/
│   ├── Home.tsx            # Search/Browse + Featured/Trending
│   ├── MangaDetail.tsx     # Manga info + chapters
│   └── ChapterReader.tsx   # Read chapter
├── store/
│   └── progressStore.ts    # Reading progress (Zustand)
├── types/
│   └── manga.ts            # TypeScript interfaces
├── App.tsx
└── main.tsx
```

## 📝 TypeScript Types

```typescript
// src/types/manga.ts
export interface Manga {
  id: string;
  title: string;
  image: string;
  url: string;
  provider: string;
  description?: string;
  genres?: string[];
  status?: string;
}

export interface Chapter {
  id: string;
  title: string;
  chapterNumber: string;
}

export interface MangaInfo extends Manga {
  chapters: Chapter[];
  totalChapters: number;
}

export interface Page {
  page: number;
  img: string;
}

export interface FeaturedChapter {
  chapterId: string;
  chapterNumber: string;
  chapterTitle: string;
  mangaId: string;
  mangaTitle: string;
  image: string;
  chapterUrl: string;
  mangaUrl: string;
}

export interface TrendingManga {
  id: string;
  title: string;
  image: string;
  url: string;
}

export interface HomeData {
  creator: string;
  status: string;
  name: string;
  version: string;
  provider: string;
  featuredChapters: FeaturedChapter[];
  trendingManga: TrendingManga[];
  featuredCount: number;
  trendingCount: number;
}

export interface RecentChapter {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: string;
  mangaId: string;
  mangaTitle: string;
  image: string;
  chapterUrl: string;
  mangaUrl: string;
  provider: string;
}

export interface SearchResponse {
  creator: string;
  status: string;
  results: Manga[];
  currentPage: number;
  hasNextPage: boolean;
}

export interface ReadingProgress {
  mangaId: string;
  mangaTitle: string;
  mangaImage: string;
  chapterId: string;
  chapterNumber: string;
  currentPage: number;
  totalPages: number;
  lastRead: number;
}
```

## 🔌 API Client

```typescript
// src/api/mangaApi.ts
import axios from 'axios';
import type { SearchResponse, MangaInfo, Page, HomeData, RecentChapter } from '../types/manga';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8788';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export const mangaApi = {
  // Get home data (featured + trending)
  getHome: async (): Promise<HomeData> => {
    const { data } = await api.get('/api/v1/home');
    return data;
  },

  // Search manga
  search: async (query: string, page = 1): Promise<SearchResponse> => {
    const { data } = await api.get(`/api/v1/search/${encodeURIComponent(query)}?page=${page}`);
    return data;
  },

  // Get manga info with chapters
  getInfo: async (mangaId: string): Promise<{ data: MangaInfo }> => {
    const { data } = await api.get(`/api/v1/info/${encodeURIComponent(mangaId)}`);
    return data;
  },

  // Get chapter pages
  getPages: async (chapterId: string): Promise<{ data: Page[] }> => {
    const { data } = await api.get(`/api/v1/read/${encodeURIComponent(chapterId)}`);
    return data;
  },

  // Get recent chapter updates
  getRecent: async (page = 1): Promise<{ results: RecentChapter[]; hasNextPage: boolean }> => {
    const { data } = await api.get(`/api/v1/recent?page=${page}`);
    return data;
  },

  // Get new manga
  getNew: async (page = 1): Promise<SearchResponse> => {
    const { data } = await api.get(`/api/v1/new?page=${page}`);
    return data;
  },

  // Get random manga
  getRandom: async (): Promise<{ data: MangaInfo }> => {
    const { data } = await api.get('/api/v1/random');
    return data;
  },

  // Get genres list
  getGenres: async () => {
    const { data } = await api.get('/api/v1/genres');
    return data;
  },

  // Advanced search with filters
  advancedSearch: async (params: {
    q?: string;
    genre?: string;
    type?: string;
    status?: string;
    page?: number;
  }): Promise<SearchResponse> => {
    const searchParams = new URLSearchParams();
    if (params.q) searchParams.append('q', params.q);
    if (params.genre) searchParams.append('genre', params.genre);
    if (params.type) searchParams.append('type', params.type);
    if (params.status) searchParams.append('status', params.status);
    if (params.page) searchParams.append('page', params.page.toString());
    
    const { data } = await api.get(`/api/v1/advanced-search?${searchParams.toString()}`);
    return data;
  },

  // Get proxied image URL (for faster loading with caching)
  getProxiedImageUrl: (imageUrl: string): string => {
    return `${API_URL}/api/v1/image?url=${encodeURIComponent(imageUrl)}`;
  },
};
```

## 🖼️ Image Optimization

### LazyImage Component with Preloading

```typescript
// src/components/LazyImage.tsx
import { useState, useRef, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export default function LazyImage({
  src,
  alt,
  className = '',
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"%3E%3Crect fill="%23161b22" width="300" height="400"/%3E%3C/svg%3E',
  onLoad,
  onError,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          img.src = src;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    );

    observer.observe(img);
    return () => observer.disconnect();
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={loaded ? src : placeholder}
      alt={alt}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      onLoad={() => {
        setLoaded(true);
        onLoad?.();
      }}
      onError={() => {
        setError(true);
        onError?.();
      }}
      loading="lazy"
      decoding="async"
    />
  );
}
```

### Image Preloader Hook for Chapter Reading

```typescript
// src/hooks/useImagePreloader.ts
import { useEffect, useRef } from 'react';

export function useImagePreloader(
  pages: { img: string }[],
  currentPage: number,
  preloadCount = 3
) {
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Preload next N pages
    for (let i = 1; i <= preloadCount; i++) {
      const nextPage = pages[currentPage - 1 + i];
      if (nextPage && !preloadedRef.current.has(nextPage.img)) {
        const img = new Image();
        img.src = nextPage.img;
        preloadedRef.current.add(nextPage.img);
      }
    }
  }, [pages, currentPage, preloadCount]);
}
```

### MangaCard with Optimized Images

```typescript
// src/components/MangaCard.tsx
import { Link } from 'react-router-dom';
import LazyImage from './LazyImage';

interface MangaCardProps {
  manga: {
    id: string;
    title: string;
    image: string;
  };
  progress?: string;
}

export default function MangaCard({ manga, progress }: MangaCardProps) {
  return (
    <Link
      to={`/manga/${encodeURIComponent(manga.id)}`}
      className="group relative overflow-hidden rounded-lg bg-gray-800 transition-transform hover:scale-105"
    >
      <LazyImage
        src={manga.image}
        alt={manga.title}
        className="aspect-[3/4] w-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
        <h3 className="text-sm font-medium text-white line-clamp-2">{manga.title}</h3>
        {progress && (
          <p className="text-xs text-green-400 mt-1">{progress}</p>
        )}
      </div>
    </Link>
  );
}
```

## 🎣 React Query Hooks

```typescript
// src/hooks/useManga.ts
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { mangaApi } from '../api/mangaApi';

// Home data (featured + trending)
export const useHomeData = () => {
  return useQuery({
    queryKey: ['home'],
    queryFn: mangaApi.getHome,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

// Search
export const useSearch = (query: string, page = 1) => {
  return useQuery({
    queryKey: ['search', query, page],
    queryFn: () => mangaApi.search(query, page),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};

// Manga info
export const useMangaInfo = (mangaId: string) => {
  return useQuery({
    queryKey: ['manga', mangaId],
    queryFn: () => mangaApi.getInfo(mangaId),
    enabled: !!mangaId,
    staleTime: 30 * 60 * 1000,
  });
};

// Chapter pages
export const useChapterPages = (chapterId: string) => {
  return useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => mangaApi.getPages(chapterId),
    enabled: !!chapterId,
    staleTime: 60 * 60 * 1000,
  });
};

// Recent chapters with infinite scroll
export const useRecentChapters = () => {
  return useInfiniteQuery({
    queryKey: ['recent'],
    queryFn: ({ pageParam = 1 }) => mangaApi.getRecent(pageParam),
    getNextPageParam: (lastPage, pages) => 
      lastPage.hasNextPage ? pages.length + 1 : undefined,
    staleTime: 3 * 60 * 1000,
  });
};

// Random manga
export const useRandomManga = () => {
  return useQuery({
    queryKey: ['random', Date.now()], // Always fresh
    queryFn: mangaApi.getRandom,
    staleTime: 0,
    cacheTime: 0,
  });
};
```

## 💾 Reading Progress Store (Zustand)

```typescript
// src/store/progressStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReadingProgress } from '../types/manga';

interface ProgressStore {
  history: ReadingProgress[];
  
  updateProgress: (progress: ReadingProgress) => void;
  getProgress: (mangaId: string) => ReadingProgress | undefined;
  removeProgress: (mangaId: string) => void;
  clearHistory: () => void;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      history: [],

      updateProgress: (progress) => {
        set((state) => {
          const filtered = state.history.filter(h => h.mangaId !== progress.mangaId);
          return {
            history: [{ ...progress, lastRead: Date.now() }, ...filtered].slice(0, 50),
          };
        });
      },

      getProgress: (mangaId) => {
        return get().history.find(h => h.mangaId === mangaId);
      },

      removeProgress: (mangaId) => {
        set((state) => ({
          history: state.history.filter(h => h.mangaId !== mangaId),
        }));
      },

      clearHistory: () => set({ history: [] }),
    }),
    { name: 'manga-progress' }
  )
);
```

## 📄 Key Pages

### Home Page with Featured & Trending

```typescript
// src/pages/Home.tsx
import { useState } from 'react';
import { useHomeData, useSearch } from '../hooks/useManga';
import { useProgressStore } from '../store/progressStore';
import MangaCard from '../components/MangaCard';
import LazyImage from '../components/LazyImage';
import { Link } from 'react-router-dom';

export default function Home() {
  const [query, setQuery] = useState('');
  const { data: homeData, isLoading: homeLoading } = useHomeData();
  const { data: searchData, isLoading: searchLoading } = useSearch(query);
  const { history } = useProgressStore();

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="container mx-auto p-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search manga..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-3 bg-[#161b22] border border-[#30363d] rounded-lg mb-6 text-white placeholder-gray-500 focus:border-[#39d353] focus:outline-none"
        />

        {/* Search Results */}
        {query && (
          <>
            {searchLoading && <p className="text-gray-400">Searching...</p>}
            {searchData?.results && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                {searchData.results.map((manga) => (
                  <MangaCard key={manga.id} manga={manga} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Home Content (when not searching) */}
        {!query && (
          <>
            {/* Continue Reading */}
            {history.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-[#39d353]">Continue Reading</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {history.slice(0, 4).map((item) => (
                    <MangaCard
                      key={item.mangaId}
                      manga={{ id: item.mangaId, title: item.mangaTitle, image: item.mangaImage }}
                      progress={`Ch. ${item.chapterNumber} - Page ${item.currentPage}`}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Featured Chapters */}
            {homeData?.featuredChapters && (
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-[#39d353]">Featured Updates</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {homeData.featuredChapters.map((chapter) => (
                    <Link
                      key={chapter.chapterId}
                      to={`/manga/${encodeURIComponent(chapter.mangaId)}`}
                      className="group relative overflow-hidden rounded-lg bg-[#161b22] border border-[#30363d]"
                    >
                      <LazyImage
                        src={chapter.image}
                        alt={chapter.mangaTitle}
                        className="aspect-[3/4] w-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                        <h3 className="text-sm font-medium line-clamp-2">{chapter.mangaTitle}</h3>
                        <p className="text-xs text-[#39d353]">Ch. {chapter.chapterNumber}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Trending Manga */}
            {homeData?.trendingManga && (
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-[#39d353]">Trending</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {homeData.trendingManga.map((manga) => (
                    <MangaCard key={manga.id} manga={manga} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

### Manga Detail Page

```typescript
// src/pages/MangaDetail.tsx
import { useParams, Link } from 'react-router-dom';
import { useMangaInfo } from '../hooks/useManga';
import { useProgressStore } from '../store/progressStore';
import LazyImage from '../components/LazyImage';

export default function MangaDetail() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const { data, isLoading } = useMangaInfo(decodeURIComponent(mangaId!));
  const progress = useProgressStore((s) => s.getProgress(mangaId!));

  if (isLoading) return <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-white">Loading...</div>;
  const manga = data?.data;
  if (!manga) return <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-white">Not found</div>;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="container mx-auto p-4">
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <LazyImage
            src={manga.image}
            alt={manga.title}
            className="w-48 rounded-lg shadow-lg"
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{manga.title}</h1>
            <p className="text-[#39d353] mb-2">{manga.status}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {manga.genres?.map((g) => (
                <span key={g} className="px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-sm">{g}</span>
              ))}
            </div>
            <p className="text-gray-300 mb-4 line-clamp-4">{manga.description}</p>
            
            {progress && (
              <Link
                to={`/read/${encodeURIComponent(progress.chapterId)}?page=${progress.currentPage}`}
                className="inline-block px-6 py-2 bg-[#39d353] text-black font-medium rounded hover:bg-[#2ea043] transition-colors"
              >
                Continue: Ch. {progress.chapterNumber}
              </Link>
            )}
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4 text-[#39d353]">Chapters ({manga.totalChapters})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {manga.chapters.map((ch) => (
            <Link
              key={ch.id}
              to={`/read/${encodeURIComponent(ch.id)}`}
              state={{ manga }}
              className="p-3 bg-[#161b22] border border-[#30363d] rounded hover:border-[#39d353] transition-colors"
            >
              Ch. {ch.chapterNumber}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Chapter Reader with Image Preloading

```typescript
// src/pages/ChapterReader.tsx
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useChapterPages } from '../hooks/useManga';
import { useImagePreloader } from '../hooks/useImagePreloader';
import { useProgressStore } from '../store/progressStore';

export default function ChapterReader() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const { data, isLoading } = useChapterPages(decodeURIComponent(chapterId!));
  const updateProgress = useProgressStore((s) => s.updateProgress);

  const pages = data?.data || [];
  const manga = location.state?.manga;

  // Preload next 3 pages
  useImagePreloader(pages, currentPage, 3);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setCurrentPage((p) => Math.max(1, p - 1));
    if (e.key === 'ArrowRight') setCurrentPage((p) => Math.min(pages.length, p + 1));
  }, [pages.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Save progress on page change
  useEffect(() => {
    if (pages.length > 0 && manga) {
      updateProgress({
        mangaId: manga.id,
        mangaTitle: manga.title,
        mangaImage: manga.image,
        chapterId: chapterId!,
        chapterNumber: chapterId!.split('-').pop() || '1',
        currentPage,
        totalPages: pages.length,
        lastRead: Date.now(),
      });
    }
  }, [currentPage, pages.length, manga, chapterId]);

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading chapter...</div>;

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation Header */}
      <div className="fixed top-0 w-full bg-black/90 backdrop-blur text-white p-4 flex justify-between items-center z-50">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-[#161b22] rounded disabled:opacity-50"
        >
          ← Prev
        </button>
        <span className="text-[#39d353]">{currentPage} / {pages.length}</span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
          disabled={currentPage === pages.length}
          className="px-4 py-2 bg-[#161b22] rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>

      {/* Page Display */}
      <div
        className="pt-16 pb-4 flex justify-center min-h-screen cursor-pointer"
        onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
      >
        {pages[currentPage - 1] && (
          <img
            src={pages[currentPage - 1].img}
            alt={`Page ${currentPage}`}
            className={`max-w-full max-h-[calc(100vh-80px)] object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
            loading="eager"
            decoding="async"
          />
        )}
      </div>

      {/* Page Indicator */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-full text-sm text-gray-400">
        Use ← → arrow keys to navigate
      </div>
    </div>
  );
}
```

## 🛣️ Router Setup

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import MangaDetail from './pages/MangaDetail';
import ChapterReader from './pages/ChapterReader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/manga/:mangaId/*" element={<MangaDetail />} />
          <Route path="/read/:chapterId/*" element={<ChapterReader />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

## 🎨 Tailwind Config (GitHub Dark Theme)

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0d1117',
        card: '#161b22',
        border: '#30363d',
        accent: '#39d353',
        'accent-hover': '#2ea043',
      },
    },
  },
  plugins: [],
};
```

## ⚙️ Environment Variables

```env
# .env
VITE_API_URL=http://localhost:8788
```

For production:
```env
VITE_API_URL=https://your-worker.your-subdomain.workers.dev
```

## 🚀 Key Features Checklist

- [x] **Home Page**: Featured chapters + trending manga from API
- [x] **Search**: Query manga via API with debouncing
- [x] **Browse**: Display results in responsive grid
- [x] **Manga Details**: Show info, genres, chapters
- [x] **Chapter List**: Navigate to specific chapters
- [x] **Page Reader**: Display chapter images with preloading
- [x] **Reading Progress**: Save/restore position (localStorage)
- [x] **Continue Reading**: Resume from last page
- [x] **Reading History**: Track recently read manga
- [x] **Image Optimization**: Lazy loading + preloading
- [x] **Keyboard Navigation**: Arrow keys in reader
- [x] **Dark Theme**: GitHub-inspired design

## 📦 Production Build

```bash
npm run build
npm run preview
```

## 🔗 API Endpoints Reference

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Home Data | `GET /api/v1/home` | Featured chapters + trending manga |
| Search | `GET /api/v1/search/:query` | Search manga by title |
| Manga Info | `GET /api/v1/info/:mangaId` | Get manga details + chapters |
| Read Chapter | `GET /api/v1/read/:chapterId` | Get chapter page images |
| Recent Updates | `GET /api/v1/recent` | Latest chapter updates |
| New Manga | `GET /api/v1/new` | Recently added manga |
| Random | `GET /api/v1/random` | Get a random manga |
| Genres | `GET /api/v1/genres` | Available genres, types, statuses |
| Advanced Search | `GET /api/v1/advanced-search` | Search with filters |
| Image Proxy | `GET /api/v1/image?url=...` | Proxied image with caching |

## 🖼️ Image Loading Best Practices

1. **Use LazyImage component** - Only loads images when they enter viewport
2. **Preload next pages** - `useImagePreloader` hook preloads upcoming pages
3. **Use `loading="lazy"`** - Browser-native lazy loading
4. **Use `decoding="async"`** - Non-blocking image decoding
5. **Image proxy** - Use `/api/v1/image?url=...` for cached images
6. **Responsive images** - Use proper aspect ratios to prevent layout shift

---

**Stack**: React 18 + TypeScript + Vite + TailwindCSS + React Query + Zustand  
**Creator**: emnextech
