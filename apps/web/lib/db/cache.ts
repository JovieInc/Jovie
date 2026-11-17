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
import {
  invalidateRedisByPrefix,
  invalidateRedisKey,
  isRedisCacheAvailable,
  isRedisCacheQuarantined,
  quarantineRedisCache,
  REDIS_CACHE_BUDGET_MS,
  tryReadFromRedis,
  withinCacheBudget,
  writeToRedis,
} from './cache-redis';

const CACHE_PREFIX = 'db:cache:v2:';
const DEFAULT_TTL_SECONDS = 60; // 1 minute default
const MAX_MEMORY_CACHE_SIZE = 5000;
const CACHE_LOAD_MAX_AGE_MS = 30_000;

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

interface CacheLoad {
  signature: string;
  invalidated: boolean;
  result: Promise<unknown>;
  write: Promise<void> | null;
  release: () => void;
}

const activeLoads = new Map<string, Set<CacheLoad>>();
let activeLoadCount = 0;
const invalidations = new Set<{
  matches: (key: string) => boolean;
  done: Promise<void>;
}>();

async function waitForInvalidation(cacheKey: string): Promise<boolean> {
  const deadline = performance.now() + REDIS_CACHE_BUDGET_MS;
  let pending = [...invalidations].filter(item => item.matches(cacheKey));
  try {
    while (pending.length > 0) {
      await withinCacheBudget(
        () => Promise.all(pending.map(item => item.done)),
        deadline
      );
      pending = [...invalidations].filter(item => item.matches(cacheKey));
    }
    return true;
  } catch (error) {
    quarantineRedisCache(error);
    return false;
  }
}

function invalidateLoads(
  matches: (key: string) => boolean,
  clearMemory: () => void,
  clearRedis: (deadline: number) => Promise<void>
): Promise<void> {
  const deadline = performance.now() + REDIS_CACHE_BUDGET_MS;
  const writes: Promise<void>[] = [];
  for (const [key, loads] of activeLoads) {
    if (!matches(key)) continue;
    for (const load of loads) {
      load.invalidated = true;
      if (load.write) writes.push(load.write);
      load.release();
    }
    activeLoads.delete(key);
  }
  clearMemory();
  if (invalidations.size >= MAX_MEMORY_CACHE_SIZE) {
    quarantineRedisCache(
      new Error('Redis cache invalidation capacity exceeded')
    );
    return Promise.resolve();
  }

  // Drain already-issued SETs before DEL; unfinished reads may still resolve
  // to their original caller, but their invalidated load cannot publish again.
  const done = Promise.resolve().then(async () => {
    try {
      await withinCacheBudget(() => Promise.all(writes), deadline);
      if (!isRedisCacheQuarantined()) await clearRedis(deadline);
    } catch (error) {
      quarantineRedisCache(error);
    }
  });
  const entry = { matches, done };
  invalidations.add(entry);
  const release = () => {
    invalidations.delete(entry);
  };
  void done.then(release, release);
  return done;
}

export interface CacheOptions {
  /** TTL in seconds (default: 60) */
  ttlSeconds?: number;
  /** Whether to use Redis (default: true) */
  useRedis?: boolean;
  /** Skip memory cache (default: false) */
  skipMemoryCache?: boolean;
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
  if ([...invalidations].some(item => item.matches(cacheKey))) {
    if (!(await waitForInvalidation(cacheKey))) return queryFn();
  }

  // Layer 1: Try in-memory cache first (fastest)
  if (!skipMemoryCache) {
    const memoryResult = memoryCache.get(cacheKey) as CacheSentinel<T> | null;
    if (memoryResult?.__sentinel) {
      return memoryResult.value;
    }
  }

  // Cache keys must already include authorization/tenant scope. Coalescing is
  // process-local and only shares requests with identical cache options.
  // Disabling both caches preserves an explicit uncached read.
  if (!useRedis && skipMemoryCache) return queryFn();
  const signature = JSON.stringify([ttlSeconds, useRedis, skipMemoryCache]);
  const loads = activeLoads.get(cacheKey) ?? new Set<CacheLoad>();
  for (const existing of loads) {
    if (existing.signature === signature) return existing.result as Promise<T>;
  }
  // Bypass caching when metadata admission is full; never retain an unbounded
  // map of distinct keys/options or make the cache an origin retry owner.
  if (activeLoadCount >= MAX_MEMORY_CACHE_SIZE) return queryFn();
  const load: CacheLoad = {
    signature,
    invalidated: false,
    result: Promise.resolve(),
    write: null,
    release: () => {},
  };
  activeLoadCount++;
  loads.add(load);
  activeLoads.set(cacheKey, loads);
  load.result = Promise.resolve().then(async () => {
    if (useRedis) {
      const cached = await tryReadFromRedis<CacheSentinel<T>>(cacheKey);
      if (cached?.__sentinel && !isRedisCacheQuarantined()) {
        if (!skipMemoryCache && !load.invalidated) {
          memoryCache.set(cacheKey, cached, ttlMs);
        }
        return cached.value;
      }
    }
    const result = await queryFn();
    const wrapped: CacheSentinel<T> = { __sentinel: true, value: result };
    if (!load.invalidated) {
      if (!skipMemoryCache) memoryCache.set(cacheKey, wrapped, ttlMs);
      if (useRedis) load.write = writeToRedis(cacheKey, wrapped, ttlSeconds);
    }
    return result;
  });
  let released = false;
  const retentionTimer = setTimeout(() => {
    if (load.write)
      quarantineRedisCache(
        new Error('Redis cache write outlived load retention')
      );
    load.invalidated = true;
    load.release();
  }, CACHE_LOAD_MAX_AGE_MS);
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(retentionTimer);
    activeLoadCount--;
    loads.delete(load);
    if (loads.size === 0 && activeLoads.get(cacheKey) === loads) {
      activeLoads.delete(cacheKey);
    }
  };
  load.release = release;
  const settled = () => {
    if (load.write) void load.write.then(release, release);
    else release();
  };
  void load.result.then(settled, settled);
  return load.result as Promise<T>;
}

/**
 * Invalidate a cached query by key.
 * Removes from both memory and Redis caches.
 *
 * @param key - Cache key to invalidate
 */
export async function invalidateCache(key: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${key}`;

  await invalidateLoads(
    candidate => candidate === cacheKey,
    () => memoryCache.delete(cacheKey),
    deadline => invalidateRedisKey(cacheKey, deadline)
  );
}

/**
 * Invalidate all cached queries matching a prefix.
 * Useful for invalidating related caches (e.g., all profile caches for a user).
 *
 * Clears this process's memory and shared Redis entries. Other processes keep
 * their already-cached values until their TTL expires.
 *
 * @param prefix - Key prefix to match
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  const fullPrefix = `${CACHE_PREFIX}${prefix}`;

  await invalidateLoads(
    candidate => candidate.startsWith(fullPrefix),
    () => {
      const deleted = memoryCache.deleteByPrefix(fullPrefix);
      if (deleted > 0) {
        Sentry.addBreadcrumb({
          category: 'db-cache',
          message: `Invalidated ${deleted} memory cache entries`,
          level: 'info',
        });
      }
    },
    deadline =>
      invalidateRedisByPrefix(
        fullPrefix,
        prefix,
        deadline,
        MAX_MEMORY_CACHE_SIZE
      )
  );
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): {
  memoryCache: { size: number; maxSize: number; utilization: number };
  redisAvailable: boolean;
  inFlightLoads: { size: number; maxSize: number; maxAgeMs: number };
} {
  return {
    memoryCache: memoryCache.stats(),
    redisAvailable: isRedisCacheAvailable(),
    inFlightLoads: {
      size: activeLoadCount,
      maxSize: MAX_MEMORY_CACHE_SIZE,
      maxAgeMs: CACHE_LOAD_MAX_AGE_MS,
    },
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
