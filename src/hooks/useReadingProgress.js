/**
 * useReadingProgress — zero-login local reading state.
 * Tracks: layers read, last layer, completion, time spent, liked stories.
 * Enables: resume reading, For You recommendations, completion badges.
 */
import { useCallback, useRef } from 'react';

const KEY_PROGRESS  = (id) => `lore:read:${id}`;
const KEY_AFFINITY  = 'lore:affinity';
const KEY_LIKED     = (id) => `lore:liked:${id}`;
const KEY_TIME      = 'lore:time';

// ── Low-level storage helpers ─────────────────────────────────────────────
function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useReadingProgress() {
  const timeEntryRef = useRef(null); // { storyId, startedAt }

  /**
   * Call this every time a new layer becomes active.
   * Stores which layers have been read and the furthest layer.
   */
  const trackLayerRead = useCallback((storyId, layerNum, storyCategory) => {
    if (!storyId) return;

    const prog = lsGet(KEY_PROGRESS(storyId), { layersRead: [], lastLayer: 0, completed: false, startedAt: Date.now() });

    if (!prog.layersRead.includes(layerNum)) {
      prog.layersRead.push(layerNum);
    }
    if (layerNum > prog.lastLayer) {
      prog.lastLayer = layerNum;
    }
    if (layerNum === 7) {
      prog.completed = true;
      prog.completedAt = Date.now();
    }

    lsSet(KEY_PROGRESS(storyId), prog);

    // Update category affinity
    if (storyCategory && layerNum <= 2) {
      const aff = lsGet(KEY_AFFINITY, {});
      aff[storyCategory] = (aff[storyCategory] || 0) + 1;
      lsSet(KEY_AFFINITY, aff);
    }
  }, []);

  /**
   * Begin tracking time for a story session.
   */
  const startTimeTracking = useCallback((storyId) => {
    timeEntryRef.current = { storyId, startedAt: Date.now() };
  }, []);

  /**
   * Save session time when user leaves.
   */
  const stopTimeTracking = useCallback(() => {
    const entry = timeEntryRef.current;
    if (!entry) return;
    const elapsed = Math.round((Date.now() - entry.startedAt) / 1000);
    const times = lsGet(KEY_TIME, {});
    times[entry.storyId] = (times[entry.storyId] || 0) + elapsed;
    lsSet(KEY_TIME, times);
    timeEntryRef.current = null;
  }, []);

  /**
   * Returns progress object for a story, or null if unread.
   */
  const getProgress = useCallback((storyId) => {
    if (!storyId) return null;
    const prog = lsGet(KEY_PROGRESS(storyId), null);
    if (!prog || prog.lastLayer === 0) return null;
    return prog;
  }, []);

  /**
   * Returns true if the user has liked (reacted to) this story.
   */
  const isLiked = useCallback((storyId) => {
    return lsGet(KEY_LIKED(storyId), false);
  }, []);

  /**
   * Returns the user's category affinity map: { true_crime: 3, psychology: 1 }
   */
  const getAffinity = useCallback(() => {
    return lsGet(KEY_AFFINITY, {});
  }, []);

  /**
   * Returns a personalized "For You" list from a given pool of stories.
   * Ranked by: affinity category match > total reactions > fallback order.
   */
  const getForYouStories = useCallback((allStories, limit = 3) => {
    if (!allStories || allStories.length === 0) return [];
    const affinity = lsGet(KEY_AFFINITY, {});
    const hasAffinity = Object.keys(affinity).length > 0;

    const scored = allStories.map(s => {
      const affinityScore = hasAffinity ? (affinity[s.category] || 0) * 3 : 0;
      const rx = s.reactions || {};
      const reactionScore = (rx.gripping || rx.heart || 0) + (rx.scared || 0) + (rx.mindblown || 0);
      const prog = lsGet(KEY_PROGRESS(s.story_id), null);
      // Don't recommend completed stories
      const penalty = prog?.completed ? -100 : 0;
      // Boost partially-started stories for resume
      const resumeBoost = (prog && !prog.completed && prog.lastLayer > 0) ? 5 : 0;
      return { ...s, _score: affinityScore + reactionScore + penalty + resumeBoost };
    });

    return scored
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  }, []);

  /**
   * Clears all reading history (privacy/reset).
   */
  const clearHistory = useCallback(() => {
    try {
      const keys = Object.keys(localStorage).filter(k =>
        k.startsWith('lore:read:') || k.startsWith('lore:liked:') ||
        k === KEY_AFFINITY || k === KEY_TIME
      );
      keys.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }, []);

  return {
    trackLayerRead,
    startTimeTracking,
    stopTimeTracking,
    getProgress,
    isLiked,
    getAffinity,
    getForYouStories,
    clearHistory,
  };
}
