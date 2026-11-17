import * as Sentry from '@sentry/nextjs';
import { captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

export const REDIS_CACHE_BUDGET_MS = 750;
const REDIS_SCAN_COUNT = 100;

// A timed-out command may still complete remotely. Never restore this process's
// trust after an uncertain write/invalidation; a cooldown cannot fence late SETs.
// One boolean bounds quarantine metadata regardless of key cardinality.
let redisCacheQuarantined = false;

export function quarantineRedisCache(error: unknown): void {
  if (redisCacheQuarantined) return;
  redisCacheQuarantined = true;
  captureWarning('[db-cache] Redis cache quarantined for this process', error);
}

export async function withinCacheBudget<T>(
  operation: () => Promise<T>,
  deadline = performance.now() + REDIS_CACHE_BUDGET_MS
): Promise<T> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('Redis cache deadline exceeded');
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Redis cache deadline exceeded')),
          remaining
        );
      }),
    ]);
    // Event-loop stalls can delay timers. Admission still respects the absolute
    // monotonic deadline even when the operation wins that delayed race.
    if (performance.now() >= deadline)
      throw new Error('Redis cache deadline exceeded');
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

export function isRedisCacheQuarantined(): boolean {
  return redisCacheQuarantined;
}

export function isRedisCacheAvailable(): boolean {
  return !redisCacheQuarantined && getRedis() !== null;
}

/**
 * Try to read a value from Redis cache.
 * Returns null if Redis is unavailable or read fails.
 */
export async function tryReadFromRedis<T>(cacheKey: string): Promise<T | null> {
  // Non-production getRedis() is null unless REDIS_URL is loopback Redis,
  // so this layer stays on the in-memory LRU and does not call Upstash.
  if (redisCacheQuarantined) return null;
  const redis = getRedis();
  if (!redis) return null;

  try {
    const result = await withinCacheBudget(() => redis.get<T>(cacheKey));
    // Another key's failed invalidation may have quarantined Redis while this
    // GET was pending. Such a response cannot refill memory or be returned.
    return redisCacheQuarantined ? null : result;
  } catch (error) {
    quarantineRedisCache(error);
    return null;
  }
}

/**
 * Write a value to Redis cache (fire-and-forget).
 */
export async function writeToRedis<T>(
  cacheKey: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  if (redisCacheQuarantined) return;
  const redis = getRedis();
  if (!redis) return;

  try {
    await withinCacheBudget(() =>
      redis.set(cacheKey, value, { ex: ttlSeconds })
    );
  } catch (error) {
    quarantineRedisCache(error);
  }
}

/**
 * Delete Redis keys in batches via pipeline to minimize HTTP round-trips.
 * Returns the number of failed deletes.
 */
async function deleteKeysInBatches(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  keys: string[],
  deadline: number
): Promise<number> {
  const BATCH_SIZE = 500;
  let failedDeletes = 0;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    if (redisCacheQuarantined) throw new Error('Redis cache quarantined');
    const batch = keys.slice(i, i + BATCH_SIZE);
    const pipeline = redis.pipeline();
    for (const key of batch) {
      pipeline.del(key);
    }
    const results = await withinCacheBudget(() => pipeline.exec(), deadline);
    if (results.length !== batch.length)
      throw new Error('Redis cache pipeline acknowledgment incomplete');
    // Upstash pipeline results are typed as unknown[], errors are Error instances
    for (const result of results) {
      if (result instanceof Error) {
        failedDeletes++;
        quarantineRedisCache(result);
      }
    }
  }
  return failedDeletes;
}

/**
 * Scan and delete Redis keys matching a prefix.
 */
export async function invalidateRedisByPrefix(
  fullPrefix: string,
  prefix: string,
  deadline: number,
  maxKeys: number
): Promise<void> {
  if (redisCacheQuarantined) return;
  const redis = getRedis();
  if (!redis) throw new Error('Redis cache invalidation unavailable');

  try {
    const keysToDelete: string[] = [];
    let cursor: string | number = 0;
    let pages = 0;

    do {
      if (redisCacheQuarantined) throw new Error('Redis cache quarantined');
      if (++pages > Math.ceil(maxKeys / REDIS_SCAN_COUNT))
        throw new Error('Redis cache scan page bound exceeded');
      const result: [string | number, string[]] = await withinCacheBudget(
        () =>
          redis.scan(cursor, {
            match: `${fullPrefix}*`,
            count: REDIS_SCAN_COUNT,
          }),
        deadline
      );
      cursor = result[0];
      if (keysToDelete.length + result[1].length > maxKeys) {
        throw new Error('Redis cache scan key bound exceeded');
      }
      keysToDelete.push(...result[1]);
    } while (cursor !== 0 && cursor !== '0');

    if (keysToDelete.length > 0) {
      const failedDeletes = await deleteKeysInBatches(
        redis,
        keysToDelete,
        deadline
      );
      Sentry.addBreadcrumb({
        category: 'db-cache',
        message: `Invalidated ${keysToDelete.length - failedDeletes}/${keysToDelete.length} Redis cache entries for prefix "${prefix}"`,
        level: 'info',
      });
    }
  } catch (error) {
    quarantineRedisCache(error);
  }
}

export async function invalidateRedisKey(
  cacheKey: string,
  deadline: number
): Promise<void> {
  if (redisCacheQuarantined) return;
  const redis = getRedis();
  if (!redis) throw new Error('Redis cache invalidation unavailable');
  await withinCacheBudget(() => redis.del(cacheKey), deadline);
}
