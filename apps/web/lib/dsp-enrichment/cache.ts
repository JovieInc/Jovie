/**
 * DSP Enrichment Response Cache
 *
 * Caches ISRC lookup and artist profile responses to reduce API calls.
 * Uses in-memory LRU cache with TTL.
 */

import 'server-only';

// Cache configuration
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ISRC_CACHE_SIZE = 10000;
const MAX_ARTIST_CACHE_SIZE = 5000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple LRU cache with TTL support.
 */
class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  constructor(maxSize: number, defaultTtlMs = CACHE_TTL_MS) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Singleton cache instances
const isrcTrackCache = new LRUCache<unknown>(MAX_ISRC_CACHE_SIZE);
const artistProfileCache = new LRUCache<unknown>(MAX_ARTIST_CACHE_SIZE);

/**
 * Get cached ISRC track lookup result.
 */
export function getCachedIsrcTrack<T>(isrc: string): T | null {
  return isrcTrackCache.get(`isrc:${isrc.toUpperCase()}`) as T | null;
}

/**
 * Cache an ISRC track lookup result.
 */
export function setCachedIsrcTrack<T>(isrc: string, track: T): void {
  isrcTrackCache.set(`isrc:${isrc.toUpperCase()}`, track);
}

/**
 * Get cached artist profile.
 */
export function getCachedArtistProfile<T>(artistId: string): T | null {
  return artistProfileCache.get(`artist:${artistId}`) as T | null;
}

/**
 * Cache an artist profile.
 */
export function setCachedArtistProfile<T>(artistId: string, profile: T): void {
  artistProfileCache.set(`artist:${artistId}`, profile);
}

/**
 * Clear all DSP enrichment caches.
 * Useful for testing or when data needs to be refreshed.
 */
export function clearDspCaches(): void {
  isrcTrackCache.clear();
  artistProfileCache.clear();
}

/**
 * Get cache statistics for monitoring.
 */
export function getDspCacheStats(): {
  isrcCacheSize: number;
  artistCacheSize: number;
} {
  return {
    isrcCacheSize: isrcTrackCache.size,
    artistCacheSize: artistProfileCache.size,
  };
}
