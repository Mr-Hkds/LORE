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
  } catch (e) { /* ignore */ }

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

    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(resolvedTitle)}&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const source = pages[pageId]?.original?.source || null;
      // Cache the result (even null, to avoid re-fetching)
      try { localStorage.setItem(cacheKey, source || 'null'); } catch (e) { /* ignore */ }
      return source;
    }
  } catch (err) {
    console.warn('Failed to fetch Wikipedia image for:', query, err);
  }
  return null;
}

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
    try {
      const res = await fetch('/content/stories.json');
      if (!res.ok) throw new Error(`Failed to load stories: ${res.status}`);
      const data = await res.json();
      setAllStories(data.stories || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load stories.json:', err);
      setError('Failed to load the archive. Please refresh.');
      setLoading(false);
    }
  }, []);

  // Load stories.json on mount
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
  };
}
