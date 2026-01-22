/**
 * Request Deduplication Utility
 *
 * Provides in-flight request deduplication and response caching for fetch calls.
 * Prevents duplicate API calls when multiple components request the same data.
 *
 * Features:
 * - In-flight request deduplication (same URL returns same promise)
 * - TTL-based response caching
 * - Automatic cache invalidation
 * - TypeScript support
 *
 * @example
 * ```ts
 * // Basic usage - GET requests are automatically deduplicated
 * const data = await dedupedFetch('/api/billing/status');
 *
 * // With options
 * const data = await dedupedFetch('/api/data', {
 *   ttlMs: 10000, // Cache for 10 seconds
 *   key: 'custom-key', // Custom cache key
 * });
 *
 * // Force refresh (bypass cache)
 * const data = await dedupedFetch('/api/data', { forceRefresh: true });
 *
 * // Invalidate specific cache entry
 * invalidateCache('/api/billing/status');
 *
 * // Clear all cache
 * clearCache();
 * ```
 */

/**
 * Cache entry storing response data and metadata
 */
interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  fetchedAt: number;
}

/**
 * Options for dedupedFetch
 */
export interface DedupedFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Custom cache key (defaults to URL) */
  key?: string;
  /** Time-to-live in milliseconds (default: 5000ms) */
  ttlMs?: number;
  /** Force refresh, bypassing cache */
  forceRefresh?: boolean;
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Result from dedupedFetch with metadata
 */
export interface DedupedFetchResult<T> {
  data: T;
  fromCache: boolean;
  fetchedAt: number;
}

// Default TTL for cached responses (5 seconds)
const DEFAULT_TTL_MS = 5_000;

// Maximum cache size to prevent memory leaks
const MAX_CACHE_SIZE = 200;

// Response cache: stores successful responses with TTL
const responseCache = new Map<string, CacheEntry>();

// In-flight requests: tracks ongoing fetches to deduplicate concurrent calls
const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Prune expired entries and enforce max cache size using LRU eviction.
 * Called before adding new entries to prevent unbounded memory growth.
 */
function pruneCache(): void {
  const now = Date.now();

  // First pass: remove expired entries
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  // Second pass: if still over limit, remove oldest entries (LRU approximation)
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const entriesToRemove = responseCache.size - MAX_CACHE_SIZE + 1;
    const keys = responseCache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const { value: key, done } = keys.next();
      if (done) break;
      responseCache.delete(key);
    }
  }
}

/**
 * Generate a cache key from URL and request options
 */
function generateCacheKey(url: string, options?: DedupedFetchOptions): string {
  if (options?.key) {
    return options.key;
  }

  // For GET requests (or no method specified), use URL as key
  const method = options?.method?.toUpperCase() ?? 'GET';
  if (method === 'GET') {
    return url;
  }

  // For other methods, include method and body hash in key
  const bodyHash = options?.body ? hashCode(String(options.body)) : '';
  return `${method}:${url}:${bodyHash}`;
}

/**
 * Simple hash function for generating cache keys from request bodies
 */
function hashCode(str: string): string {
  let hash = 0;
  for (const ch of str) {
    const char = ch.codePointAt(0) ?? 0;
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Perform a fetch with request deduplication and response caching.
 *
 * - GET requests to the same URL are automatically deduplicated
 * - Successful responses are cached with configurable TTL
 * - Multiple components calling the same endpoint simultaneously
 *   will share the same promise and receive the same result
 *
 * @param url - The URL to fetch
 * @param options - Fetch options plus caching configuration
 * @returns Promise resolving to parsed JSON response
 */
export async function dedupedFetch<T = unknown>(
  url: string,
  options?: DedupedFetchOptions
): Promise<T> {
  const result = await dedupedFetchWithMeta<T>(url, options);
  return result.data;
}

/**
 * Perform a fetch with request deduplication and return metadata.
 *
 * Similar to dedupedFetch but returns additional information about
 * whether the response came from cache and when it was fetched.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options plus caching configuration
 * @returns Promise resolving to result with metadata
 */
export async function dedupedFetchWithMeta<T = unknown>(
  url: string,
  options?: DedupedFetchOptions
): Promise<DedupedFetchResult<T>> {
  const key = generateCacheKey(url, options);
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return {
        data: cached.data as T,
        fromCache: true,
        fetchedAt: cached.fetchedAt,
      };
    }
  }

  // Check for in-flight request
  const inflight = inflightRequests.get(key);
  if (inflight && !forceRefresh) {
    // Return the existing promise - all callers share the same result
    const data = (await inflight) as T;
    const cached = responseCache.get(key);
    return {
      data,
      fromCache: false, // It was in-flight, not from cache
      fetchedAt: cached?.fetchedAt ?? Date.now(),
    };
  }

  // Create new fetch request
  const {
    key: _key,
    ttlMs: _ttlMs,
    forceRefresh: _forceRefresh,
    ...fetchOptions
  } = options ?? {};

  const fetchPromise = (async (): Promise<T> => {
    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new FetchError(
          `Request failed: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = (await response.json()) as T;
      const fetchedAt = Date.now();

      // Prune cache before adding new entry to prevent memory leaks
      pruneCache();

      // Cache successful response
      responseCache.set(key, {
        data,
        expiresAt: fetchedAt + ttlMs,
        fetchedAt,
      });

      return data;
    } finally {
      // Always remove from in-flight map when done
      inflightRequests.delete(key);
    }
  })();

  // Track as in-flight
  inflightRequests.set(key, fetchPromise);

  const data = await fetchPromise;
  const cached = responseCache.get(key);

  return {
    data,
    fromCache: false,
    fetchedAt: cached?.fetchedAt ?? Date.now(),
  };
}

/**
 * Custom error class for fetch failures with status information
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Invalidate a specific cache entry
 *
 * @param keyOrUrl - The cache key or URL to invalidate
 */
export function invalidateCache(keyOrUrl: string): void {
  responseCache.delete(keyOrUrl);
}

/**
 * Invalidate multiple cache entries matching a pattern
 *
 * @param predicate - Function to test if a key should be invalidated
 */
export function invalidateCacheMatching(
  predicate: (key: string) => boolean
): void {
  for (const key of responseCache.keys()) {
    if (predicate(key)) {
      responseCache.delete(key);
    }
  }
}

/**
 * Clear all cached responses
 */
export function clearCache(): void {
  responseCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  cacheSize: number;
  inflightCount: number;
  keys: string[];
} {
  return {
    cacheSize: responseCache.size,
    inflightCount: inflightRequests.size,
    keys: Array.from(responseCache.keys()),
  };
}

/**
 * Prefetch a URL and cache the response
 *
 * Useful for preloading data that will be needed soon.
 *
 * @param url - The URL to prefetch
 * @param options - Fetch options
 */
export async function prefetch<T = unknown>(
  url: string,
  options?: DedupedFetchOptions
): Promise<void> {
  try {
    await dedupedFetch<T>(url, options);
  } catch {
    // Silently ignore prefetch errors
  }
}
