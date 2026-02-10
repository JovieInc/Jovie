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

const CACHE_PREFIX = 'db:cache:v2:';
const DEFAULT_TTL_SECONDS = 60; // 1 minute default
const MAX_MEMORY_CACHE_SIZE = 5000;

/**
 * Sentinel wrapper to distinguish cached null/undefined from cache miss.
 * Without this, queries returning null (e.g., 404 paths) are never cached,
 * causing repeated database hits (cache stampede).
 *
 * Named CacheSentinel to avoid confusion with CacheEntry from pacer/cache.ts.
 */
type CacheSentinel<T> = { __sentinel: true; value: T };

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
    captureWarning('[db-cache] Redis read failed', error);
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
    captureWarning('[db-cache] Redis write failed', err);
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
    const memoryResult = memoryCache.get(cacheKey) as CacheSentinel<T> | null;
    if (memoryResult?.__sentinel) {
      return memoryResult.value;
    }
  }

  // Layer 2: Try Redis if enabled
  if (useRedis) {
    const redisResult = await tryReadFromRedis<CacheSentinel<T>>(cacheKey);
    if (redisResult?.__sentinel) {
      // Populate memory cache from Redis hit
      if (!skipMemoryCache) {
        memoryCache.set(cacheKey, redisResult, ttlMs);
      }
      return redisResult.value;
    }
  }

  // Layer 3: Cache miss - execute query
  const result = await queryFn();

  // Wrap in sentinel so null/undefined results are cached too,
  // preventing repeated DB queries on 404/bot paths
  const wrapped: CacheSentinel<T> = { __sentinel: true, value: result };

  // Populate caches (fire-and-forget for non-blocking)
  if (!skipMemoryCache) {
    memoryCache.set(cacheKey, wrapped, ttlMs);
  }

  if (useRedis) {
    writeToRedis(cacheKey, wrapped, ttlSeconds);
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
      captureWarning('[db-cache] Redis delete failed', err);
    });
  }
}

/**
 * Delete Redis keys in batches via pipeline to minimize HTTP round-trips.
 * Returns the number of failed deletes.
 */
async function deleteKeysInBatches(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  keys: string[]
): Promise<number> {
  const BATCH_SIZE = 500;
  let failedDeletes = 0;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const pipeline = redis.pipeline();
    for (const key of batch) {
      pipeline.del(key);
    }
    const results = await pipeline.exec();
    // Upstash pipeline results are typed as unknown[], errors are Error instances
    for (const result of results) {
      if (result instanceof Error) {
        failedDeletes++;
        captureWarning('[db-cache] Redis pipeline DEL failed', result);
      }
    }
  }
  return failedDeletes;
}

/**
 * Scan and delete Redis keys matching a prefix.
 */
async function invalidateRedisByPrefix(
  fullPrefix: string,
  prefix: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const keysToDelete: string[] = [];
    let cursor: string | number = 0;

    do {
      const result: [string | number, string[]] = await redis.scan(cursor, {
        match: `${fullPrefix}*`,
        count: 100,
      });
      cursor = result[0];
      keysToDelete.push(...result[1]);
    } while (cursor !== 0 && cursor !== '0');

    if (keysToDelete.length > 0) {
      const failedDeletes = await deleteKeysInBatches(redis, keysToDelete);
      Sentry.addBreadcrumb({
        category: 'db-cache',
        message: `Invalidated ${keysToDelete.length - failedDeletes}/${keysToDelete.length} Redis cache entries for prefix "${prefix}"`,
        level: 'info',
      });
    }
  } catch (error) {
    captureWarning('[db-cache] Redis prefix invalidation failed', error);
  }
}

/**
 * Invalidate all cached queries matching a prefix.
 * Useful for invalidating related caches (e.g., all profile caches for a user).
 *
 * Clears both in-memory and Redis caches so other instances don't serve stale data.
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

  // Invalidate Redis cache using SCAN to find matching keys
  await invalidateRedisByPrefix(fullPrefix, prefix);
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
export async function clearAllCaches(): Promise<void> {
  memoryCache.clear();
  // Clear Redis cache entries matching our prefix
  await invalidateCacheByPrefix('');
}
