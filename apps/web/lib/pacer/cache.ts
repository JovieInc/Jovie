/**
 * Validation Cache Utility
 *
 * Provides a unified caching solution for TanStack Pacer hooks with:
 * - TTL (time-to-live) support for automatic expiration
 * - Size limits to prevent memory leaks
 * - Type-safe API
 *
 * @see https://tanstack.com/pacer
 */

export interface CacheOptions {
  /** Time-to-live in milliseconds (default: 60000 = 1 minute) */
  ttlMs?: number;
  /** Maximum cache size (default: 100) */
  maxSize?: number;
}

export interface CacheEntry<V> {
  value: V;
  timestamp: number;
}

export interface ValidationCache<K, V> {
  /** Get a cached value (returns undefined if not found or expired) */
  get: (key: K) => V | undefined;
  /** Set a cached value */
  set: (key: K, value: V) => void;
  /** Check if a key exists and is not expired */
  has: (key: K) => boolean;
  /** Invalidate a specific key */
  invalidate: (key: K) => void;
  /** Clear all cached values */
  clear: () => void;
  /** Get current cache size */
  size: () => number;
}

/**
 * Create a validation cache with TTL and size limits.
 *
 * @example
 * ```tsx
 * const cache = createValidationCache<string, boolean>({
 *   ttlMs: 60000,  // 1 minute TTL
 *   maxSize: 100,  // Max 100 entries
 * });
 *
 * // In your validation hook
 * const cachedResult = cache.get(handle);
 * if (cachedResult !== undefined) {
 *   return cachedResult;
 * }
 *
 * const result = await checkAvailability(handle);
 * cache.set(handle, result);
 * ```
 */
export function createValidationCache<K, V>(
  options: CacheOptions = {}
): ValidationCache<K, V> {
  const { ttlMs = 60_000, maxSize = 100 } = options;
  const cache = new Map<K, CacheEntry<V>>();

  const isExpired = (entry: CacheEntry<V>): boolean => {
    return Date.now() - entry.timestamp > ttlMs;
  };

  const evictOldest = (): void => {
    if (cache.size >= maxSize) {
      // Find and remove the oldest entry
      let oldestKey: K | undefined;
      let oldestTime = Infinity;

      for (const [key, entry] of cache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
  };

  return {
    get(key: K): V | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;

      if (isExpired(entry)) {
        cache.delete(key);
        return undefined;
      }

      return entry.value;
    },

    set(key: K, value: V): void {
      // Evict oldest if at capacity
      if (!cache.has(key)) {
        evictOldest();
      }

      cache.set(key, { value, timestamp: Date.now() });
    },

    has(key: K): boolean {
      const entry = cache.get(key);
      if (!entry) return false;

      if (isExpired(entry)) {
        cache.delete(key);
        return false;
      }

      return true;
    },

    invalidate(key: K): void {
      cache.delete(key);
    },

    clear(): void {
      cache.clear();
    },

    size(): number {
      // Clean up expired entries and return actual size
      for (const [key, entry] of cache.entries()) {
        if (isExpired(entry)) {
          cache.delete(key);
        }
      }
      return cache.size;
    },
  };
}

/**
 * Default cache options for common use cases
 */
export const CACHE_PRESETS = {
  /** Short-lived cache for real-time validation (30 seconds) */
  validation: { ttlMs: 30_000, maxSize: 50 },
  /** Medium cache for search results (2 minutes) */
  search: { ttlMs: 120_000, maxSize: 100 },
  /** Longer cache for API responses (5 minutes) */
  api: { ttlMs: 300_000, maxSize: 200 },
} as const;
