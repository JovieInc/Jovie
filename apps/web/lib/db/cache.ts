/**
 * Database Query Cache
 *
 * Multi-layer caching for database query results:
 * 1. In-memory LRU for hot data (process-local)
 * 2. Redis for distributed caching across instances
 *
 * Cache invalidation patterns:
 * - Time-based TTL (default)
 * - Explicit invalidation on mutations
 */

import * as Sentry from '@sentry/nextjs';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

const CACHE_PREFIX = 'db:cache:';
const DEFAULT_TTL_SECONDS = 60; // 1 minute default
const MAX_MEMORY_CACHE_SIZE = 5000;

/**
 * In-memory LRU cache for process-local caching.
 * Provides sub-millisecond access for hot data.
 */
class InMemoryCache<T> {
  private readonly cache = new Map<string, { value: T; expiresAt: number }>();
  private readonly maxSize: number;

  constructor(maxSize = MAX_MEMORY_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (LRU - most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all entries matching a prefix pattern.
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; maxSize: number; utilization: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: Math.round((this.cache.size / this.maxSize) * 100),
    };
  }
}

// Singleton in-memory cache
const memoryCache = new InMemoryCache<unknown>(MAX_MEMORY_CACHE_SIZE);

export interface CacheOptions {
  /** TTL in seconds (default: 60) */
  ttlSeconds?: number;
  /** Whether to use Redis (default: true) */
  useRedis?: boolean;
  /** Skip memory cache (default: false) */
  skipMemoryCache?: boolean;
}

/**
 * Try to read a value from Redis cache.
 * Returns null if Redis is unavailable or read fails.
 */
async function tryReadFromRedis<T>(cacheKey: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    return await redis.get<T>(cacheKey);
  } catch (error) {
    captureWarning('[db-cache] Redis read failed', { error });
    return null;
  }
}

/**
 * Write a value to Redis cache (fire-and-forget).
 */
function writeToRedis<T>(cacheKey: string, value: T, ttlSeconds: number): void {
  const redis = getRedis();
  if (!redis) return;

  redis.set(cacheKey, value, { ex: ttlSeconds }).catch(err => {
    captureWarning('[db-cache] Redis write failed', { error: err });
  });
}

/**
 * Cache a query result with automatic multi-layer caching.
 *
 * Cache layers (checked in order):
 * 1. In-memory LRU cache (fastest, process-local)
 * 2. Redis cache (shared across instances)
 * 3. Execute query function (slowest, database round-trip)
 *
 * @param key - Unique cache key for this query
 * @param queryFn - Function to execute if cache miss
 * @param options - Caching options
 * @returns Cached or fresh query result
 */
export async function cacheQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const {
    ttlSeconds = DEFAULT_TTL_SECONDS,
    useRedis = true,
    skipMemoryCache = false,
  } = options;
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const ttlMs = ttlSeconds * 1000;

  // Layer 1: Try in-memory cache first (fastest)
  if (!skipMemoryCache) {
    const memoryResult = memoryCache.get(cacheKey) as T | null;
    if (memoryResult !== null) {
      return memoryResult;
    }
  }

  // Layer 2: Try Redis if enabled
  if (useRedis) {
    const redisResult = await tryReadFromRedis<T>(cacheKey);
    if (redisResult !== null) {
      // Populate memory cache from Redis hit
      if (!skipMemoryCache) {
        memoryCache.set(cacheKey, redisResult, ttlMs);
      }
      return redisResult;
    }
  }

  // Layer 3: Cache miss - execute query
  const result = await queryFn();

  // Populate caches (fire-and-forget for non-blocking)
  if (!skipMemoryCache) {
    memoryCache.set(cacheKey, result, ttlMs);
  }

  if (useRedis) {
    writeToRedis(cacheKey, result, ttlSeconds);
  }

  return result;
}

/**
 * Invalidate a cached query by key.
 * Removes from both memory and Redis caches.
 *
 * @param key - Cache key to invalidate
 */
export async function invalidateCache(key: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${key}`;

  // Invalidate memory cache
  memoryCache.delete(cacheKey);

  // Invalidate Redis cache
  const redis = getRedis();
  if (redis) {
    await redis.del(cacheKey).catch(err => {
      captureWarning('[db-cache] Redis delete failed', { error: err });
    });
  }
}

/**
 * Invalidate all cached queries matching a prefix.
 * Useful for invalidating related caches (e.g., all profile caches for a user).
 *
 * @param prefix - Key prefix to match
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  const fullPrefix = `${CACHE_PREFIX}${prefix}`;

  // Invalidate memory cache
  const deleted = memoryCache.deleteByPrefix(fullPrefix);
  if (deleted > 0) {
    Sentry.addBreadcrumb({
      category: 'db-cache',
      message: `Invalidated ${deleted} memory cache entries`,
      level: 'info',
    });
  }

  // For Redis, we'd need SCAN which isn't ideal for Upstash REST API
  // For now, rely on TTL expiration for Redis prefix invalidation
  // In a production scenario, consider using Redis Pub/Sub for cache invalidation
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): {
  memoryCache: { size: number; maxSize: number; utilization: number };
  redisAvailable: boolean;
} {
  return {
    memoryCache: memoryCache.stats(),
    redisAvailable: getRedis() !== null,
  };
}

/**
 * Clear all caches. Use with caution - primarily for testing.
 */
export function clearAllCaches(): void {
  memoryCache.clear();
  // Redis cache will expire naturally via TTL
}
