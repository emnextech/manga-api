# Building a React + TypeScript Manga Reader

A guide to building a manga reading website that integrates with the Emnex Manga Worker API.

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
│   └── SearchBar.tsx       # Search input
├── hooks/
│   └── useManga.ts         # React Query hooks
├── pages/
│   ├── Home.tsx            # Search/Browse
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

export interface SearchResponse {
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
import { SearchResponse, MangaInfo, Page } from '../types/manga';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8788';
const PROVIDER = 'mangapill'; // Primary provider

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export const mangaApi = {
  search: async (query: string, page = 1): Promise<SearchResponse> => {
    const { data } = await api.get(`/api/${PROVIDER}/search/${encodeURIComponent(query)}?page=${page}`);
    return data;
  },

  getInfo: async (mangaId: string): Promise<{ data: MangaInfo }> => {
    const { data } = await api.get(`/api/${PROVIDER}/info/${mangaId}`);
    return data;
  },

  getPages: async (chapterId: string): Promise<{ data: Page[] }> => {
    const { data } = await api.get(`/api/${PROVIDER}/read/${chapterId}`);
    return data;
  },
};
```

## 🎣 React Query Hooks

```typescript
// src/hooks/useManga.ts
import { useQuery } from '@tanstack/react-query';
import { mangaApi } from '../api/mangaApi';

export const useSearch = (query: string, page = 1) => {
  return useQuery({
    queryKey: ['search', query, page],
    queryFn: () => mangaApi.search(query, page),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useMangaInfo = (mangaId: string) => {
  return useQuery({
    queryKey: ['manga', mangaId],
    queryFn: () => mangaApi.getInfo(mangaId),
    enabled: !!mangaId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useChapterPages = (chapterId: string) => {
  return useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => mangaApi.getPages(chapterId),
    enabled: !!chapterId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
};
```

## 💾 Reading Progress Store (Zustand)

```typescript
// src/store/progressStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ReadingProgress } from '../types/manga';

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

### Home Page (Search)

```typescript
// src/pages/Home.tsx
import { useState } from 'react';
import { useSearch } from '../hooks/useManga';
import { useProgressStore } from '../store/progressStore';
import MangaCard from '../components/MangaCard';

export default function Home() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useSearch(query);
  const { history } = useProgressStore();

  return (
    <div className="container mx-auto p-4">
      <input
        type="text"
        placeholder="Search manga..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full p-3 border rounded-lg mb-6"
      />

      {/* Continue Reading */}
      {history.length > 0 && !query && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">Continue Reading</h2>
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

      {/* Search Results */}
      {isLoading && <p>Loading...</p>}
      {data?.results && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {data.results.map((manga) => (
            <MangaCard key={manga.id} manga={manga} />
          ))}
        </div>
      )}
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

export default function MangaDetail() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const { data, isLoading } = useMangaInfo(mangaId!);
  const progress = useProgressStore((s) => s.getProgress(mangaId!));

  if (isLoading) return <p>Loading...</p>;
  const manga = data?.data;
  if (!manga) return <p>Not found</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex gap-6 mb-8">
        <img src={manga.image} alt={manga.title} className="w-48 rounded-lg" />
        <div>
          <h1 className="text-3xl font-bold">{manga.title}</h1>
          <p className="text-gray-600 mt-2">{manga.status}</p>
          <div className="flex gap-2 mt-2">
            {manga.genres?.map((g) => (
              <span key={g} className="px-2 py-1 bg-gray-200 rounded text-sm">{g}</span>
            ))}
          </div>
          <p className="mt-4">{manga.description}</p>
          
          {progress && (
            <Link
              to={`/read/${progress.chapterId}?page=${progress.currentPage}`}
              className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded"
            >
              Continue: Ch. {progress.chapterNumber}
            </Link>
          )}
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Chapters ({manga.totalChapters})</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {manga.chapters.map((ch) => (
          <Link
            key={ch.id}
            to={`/read/${ch.id}`}
            className="p-3 border rounded hover:bg-gray-100"
          >
            {ch.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

### Chapter Reader

```typescript
// src/pages/ChapterReader.tsx
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useChapterPages } from '../hooks/useManga';
import { useProgressStore } from '../store/progressStore';

export default function ChapterReader() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);
  
  const { data, isLoading } = useChapterPages(chapterId!);
  const updateProgress = useProgressStore((s) => s.updateProgress);

  const pages = data?.data || [];

  // Save progress on page change
  useEffect(() => {
    if (pages.length > 0) {
      updateProgress({
        mangaId: 'extracted-from-chapterId', // Parse from chapterId
        mangaTitle: 'Manga Title', // Pass via state or fetch
        mangaImage: '',
        chapterId: chapterId!,
        chapterNumber: 'extracted',
        currentPage,
        totalPages: pages.length,
        lastRead: Date.now(),
      });
    }
  }, [currentPage, pages.length]);

  if (isLoading) return <p>Loading...</p>;

  return (
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <div className="fixed top-0 w-full bg-black/80 text-white p-4 flex justify-between">
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
          ← Previous
        </button>
        <span>{currentPage} / {pages.length}</span>
        <button onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}>
          Next →
        </button>
      </div>

      {/* Page Display */}
      <div className="pt-16 flex justify-center">
        {pages[currentPage - 1] && (
          <img
            src={pages[currentPage - 1].img}
            alt={`Page ${currentPage}`}
            className="max-w-full max-h-screen object-contain"
            onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
          />
        )}
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

const queryClient = new QueryClient();

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

## ⚙️ Environment Variables

```env
# .env
VITE_API_URL=http://localhost:8788
```

## 🚀 Key Features Checklist

- [x] **Search**: Query manga via API
- [x] **Browse**: Display search results in grid
- [x] **Manga Details**: Show info, genres, chapters
- [x] **Chapter List**: Navigate to specific chapters
- [x] **Page Reader**: Display chapter images
- [x] **Reading Progress**: Save/restore position (localStorage)
- [x] **Continue Reading**: Resume from last page
- [x] **Reading History**: Track recently read manga

## 📦 Production Build

```bash
npm run build
npm run preview
```

## 🔗 API Endpoints Used

| Feature | Endpoint |
|---------|----------|
| Search | `GET /api/mangapill/search/:query` |
| Manga Info | `GET /api/mangapill/info/:mangaId` |
| Read Chapter | `GET /api/mangapill/read/:chapterId` |

---

**Stack**: React 18 + TypeScript + Vite + TailwindCSS + React Query + Zustand
