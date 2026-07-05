import { useState, useEffect, useCallback, useRef } from 'react';

const IMAGE_CACHE_PREFIX = 'lore:img:';

/**
 * Fetch a Wikipedia image for a given article title.
 * Returns the image URL or null.
 */
async function fetchWikipediaImage(query) {
  if (!query) return null;

  // Check localStorage cache first
  const cacheKey = `${IMAGE_CACHE_PREFIX}${query}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached === 'null' ? null : cached;
  } catch { /* ignore */ }

  try {
    let resolvedTitle = query;

    // Search Wikipedia first to find the best matching article title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const firstResult = searchData?.query?.search?.[0];
      if (firstResult?.title) {
        resolvedTitle = firstResult.title;
      }
    }

    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=800&titles=${encodeURIComponent(resolvedTitle)}&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const source = pages[pageId]?.thumbnail?.source || pages[pageId]?.original?.source || null;
      // Cache the result (even null, to avoid re-fetching)
      try { localStorage.setItem(cacheKey, source || 'null'); } catch { /* ignore */ }
      return source;
    }
  } catch (err) {
    console.warn('Failed to fetch Wikipedia image for:', query, err);
  }
  return null;
}

const appStorage = {
  async get(key) {
    try {
      if (window.storage && typeof window.storage.get === 'function') {
        const res = await window.storage.get(key);
        if (res) {
          const str = typeof res === 'object' && res.value !== undefined ? res.value : res;
          return typeof str === 'string' ? JSON.parse(str) : str;
        }
        return null;
      }
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      console.warn('Storage read error:', e);
      return null;
    }
  },
  async set(key, value) {
    try {
      const str = JSON.stringify(value);
      if (window.storage && typeof window.storage.set === 'function') {
        await window.storage.set(key, str);
        return;
      }
      localStorage.setItem(key, str);
    } catch (e) {
      console.warn('Storage write error:', e);
    }
  }
};

/**
 * Hook that loads static story content from /content/stories.json.
 * No API calls to any AI service. Zero tokens consumed.
 */
export function useStaticContent() {
  const [allStories, setAllStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const imageCache = useRef({}); // In-memory image URL cache

  const loadStories = useCallback(async () => {
    let initialList = [];
    try {
      // 1. Fetch from static JSON file first (Edge CDN - extremely fast, no cold start)
      const res = await fetch(`/content/stories.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('CDN fetch failed');
      const data = await res.json();
      initialList = data.stories || [];

      // Merge overrides from storage
      try {
        let overrides = await appStorage.get('lore:story-overrides');
        if (overrides) {
          // Auto-migrate legacy nested directory cover paths to flat layout
          let hasMigration = false;
          for (const key of Object.keys(overrides)) {
            const over = overrides[key];
            if (over && over.hero_image && over.hero_image.endsWith('/cover.jpg')) {
              over.hero_image = `/content/images/${key}.jpg`;
              hasMigration = true;
            }
          }
          if (hasMigration) {
            await appStorage.set('lore:story-overrides', overrides);
          }
          
          initialList = initialList.map(s => {
            const over = overrides[s.story_id];
            return over ? { ...s, ...over } : s;
          });
        }
      } catch (storageErr) {
        console.warn('Failed to merge storage overrides:', storageErr);
      }

      setAllStories(initialList);
      setLoading(false);
    } catch (err) {
      console.warn('CDN fetch failed, falling back to database API:', err.message);
    }

    // 2. Background Revalidation (Stale-While-Revalidate)
    // Fetch live data from the database to merge any updates (covers, new stories) instantly without rebuilds
    try {
      const res = await fetch(`/api/stories?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        let liveList = Array.isArray(data) ? data : (data.stories || []);

        // Merge overrides
        try {
          const overrides = await appStorage.get('lore:story-overrides');
          if (overrides) {
            liveList = liveList.map(s => {
              const over = overrides[s.story_id];
              return over ? { ...s, ...over } : s;
            });
          }
        } catch (storageErr) {
          console.warn('Failed to merge storage overrides in background:', storageErr);
        }

        // Only update state if the live list is different (to prevent infinite renders/flicker)
        setAllStories(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(liveList)) {
            return liveList;
          }
          return prev;
        });
      }
    } catch (bgErr) {
      console.warn('Background database revalidation failed:', bgErr.message);
      // If we didn't load initialList yet, throw error
      if (initialList.length === 0) {
        setError('Failed to load the archive. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load stories on mount
  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Get all stories for a given category
  const getStoriesByCategory = useCallback((categoryId) => {
    // Map frontend category IDs to story category IDs
    const categoryMap = {
      'psychology': 'psychology',
      'mythology': 'mythology',
      'true-crime': 'true_crime',
      'gov-experiments': 'gov_experiments',
      'paranormal-reports': 'paranormal',
      'conspiracy': 'conspiracy',
      'cyber-mysteries': 'cyber_mysteries',
    };
    const mapped = categoryMap[categoryId] || categoryId;
    return allStories.filter(s => s.category === mapped);
  }, [allStories]);

  // Get a single story by ID
  const getStoryById = useCallback((storyId) => {
    return allStories.find(s => s.story_id === storyId) || null;
  }, [allStories]);

  // Get connected stories for a given story
  const getConnectedStories = useCallback((storyId) => {
    const story = allStories.find(s => s.story_id === storyId);
    if (!story?.connections) return [];

    return story.connections.map(conn => {
      const connectedStory = allStories.find(s => s.story_id === conn.story_id);
      return {
        ...conn,
        title: connectedStory?.title || 'Unknown Dossier',
        category: connectedStory?.category || 'unknown',
        hook: connectedStory?.hook || '',
      };
    }).filter(conn => conn.title !== 'Unknown Dossier');
  }, [allStories]);

  // Get story count per category
  const getCategoryCounts = useCallback(() => {
    const counts = {};
    allStories.forEach(s => {
      counts[s.category] = (counts[s.category] || 0) + 1;
    });
    return counts;
  }, [allStories]);

  // Fetch and cache a Wikipedia image by query string
  const getImageByQuery = useCallback(async (query) => {
    if (!query) return null;

    // If it's already a direct URL or local path, return it directly
    if (query.startsWith('http') || query.startsWith('/')) {
      return query;
    }

    // Check in-memory cache
    if (imageCache.current[query]) {
      return imageCache.current[query];
    }

    const imageUrl = await fetchWikipediaImage(query);
    if (imageUrl) {
      imageCache.current[query] = imageUrl;
    }
    return imageUrl;
  }, []);

  // Fetch and cache a Wikipedia image for a story (backwards compatibility)
  const getStoryImage = useCallback(async (story) => {
    if (!story?.image_query) return null;
    return getImageByQuery(story.image_query);
  }, [getImageByQuery]);

  // Update a story's reactions count in state optimistically
  const updateStoryReactions = useCallback((storyId, reactions) => {
    setAllStories(prev => prev.map(s => s.story_id === storyId ? { ...s, reactions } : s));
  }, []);

  return {
    allStories,
    loading,
    error,
    getStoriesByCategory,
    getStoryById,
    getConnectedStories,
    getCategoryCounts,
    getStoryImage,
    getImageByQuery,
    refetchStories: loadStories,
    updateStoryReactions,
  };
}
