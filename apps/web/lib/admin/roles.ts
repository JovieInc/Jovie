import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

/**
 * Redis-based distributed cache for admin role checks
 * Primary: Redis (1 minute TTL, distributed across instances)
 * Fallback: In-memory Map (when Redis unavailable)
 *
 * Additionally uses React's cache() for request-level deduplication to ensure
 * consistent admin status within a single request (prevents race conditions
 * where sidebar and layout might see different values).
 */
const REDIS_CACHE_TTL_SECONDS = 60; // 1 minute (reduced from 5 for faster revocation)
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 60 seconds - matches Redis TTL for consistency
const STALE_GRACE_MS = 5 * 60 * 1000; // 5 minutes - keep expired entries as DB-failure fallback
const REDIS_KEY_PREFIX = 'admin:role:';
const MAX_FALLBACK_CACHE_SIZE = 100; // Max users to cache in memory

// Keep in-memory cache as fallback when Redis unavailable
const fallbackCache = new Map<
  string,
  { isAdmin: boolean; expiresAt: number }
>();

/**
 * Prune stale entries beyond the grace period and enforce max cache size.
 * Entries within the stale grace window are kept as DB-failure fallbacks.
 * Called before adding new entries to prevent unbounded memory growth.
 */
function pruneFallbackCache(now: number): void {
  // First pass: remove entries past the stale grace period
  for (const [key, entry] of fallbackCache) {
    if (entry.expiresAt + STALE_GRACE_MS <= now) {
      fallbackCache.delete(key);
    }
  }

  // Second pass: if still over limit, remove oldest entries
  if (fallbackCache.size >= MAX_FALLBACK_CACHE_SIZE) {
    const entriesToRemove = fallbackCache.size - MAX_FALLBACK_CACHE_SIZE + 1;
    const keys = fallbackCache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const { value: key, done } = keys.next();
      if (done) break;
      fallbackCache.delete(key);
    }
  }
}

/**
 * Query the database for admin role status.
 * Throws on DB errors so callers can avoid caching failure results.
 * @internal
 */
async function queryAdminRoleFromDB(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  return user?.isAdmin ?? false;
}

/**
 * Query admin role from DB with a single retry on transient errors.
 * Returns the result on success, or null if both attempts fail.
 * The last error is returned for the caller to handle.
 * @internal
 */
async function queryWithRetry(
  userId: string
): Promise<{ result: boolean } | { error: unknown }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { result: await queryAdminRoleFromDB(userId) };
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
  return { error: lastError };
}

/**
 * Handle DB query failure by falling back to stale cache or denying access.
 *
 * When the DB is unreachable, we prefer returning stale cached results over
 * revoking access. This prevents transient DB issues (Neon cold starts,
 * connection pool exhaustion) from intermittently hiding admin nav items
 * or returning 404s on admin routes.
 *
 * @internal
 */
function handleDbFailure(
  userId: string,
  staleEntry: { isAdmin: boolean; expiresAt: number } | undefined,
  lastError: unknown
): boolean {
  if (staleEntry !== undefined) {
    captureWarning(
      '[admin/roles] DB query failed after retry, using stale cache',
      { userId, isAdmin: staleEntry.isAdmin, expiredAt: staleEntry.expiresAt }
    );
    return staleEntry.isAdmin;
  }
  captureError(
    '[admin/roles] DB query failed after retry, no cache available — denying access',
    lastError
  );
  return false;
}

/**
 * Try Redis cache, returning the cached value or querying DB and storing result.
 * Returns null if Redis is unavailable or errors out (caller falls through to memory).
 * @internal
 */
async function tryRedisPath(
  userId: string,
  cacheKey: string,
  redis: NonNullable<ReturnType<typeof getRedis>>
): Promise<boolean | null> {
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    const dbResult = await queryWithRetry(userId);
    if ('result' in dbResult) {
      await redis.set(cacheKey, dbResult.result ? '1' : '0', {
        ex: REDIS_CACHE_TTL_SECONDS,
      });
      return dbResult.result;
    }

    // DB retry exhausted — use stale memory cache or deny
    const staleEntry = fallbackCache.get(userId);
    return handleDbFailure(userId, staleEntry, dbResult.error);
  } catch (error) {
    captureWarning('[admin/roles] Redis cache failed, falling back to memory', {
      error,
    });
    return null; // Signal caller to fall through to memory cache
  }
}

/**
 * Check if a user has admin role based on database verification.
 * Results are cached for 1 minute (distributed via Redis, or in-memory fallback).
 *
 * Uses React's cache() for request-level deduplication to ensure all components
 * in the same request see the same admin status.
 *
 * @param userId - Clerk user ID
 * @returns Promise<boolean> - True if user has admin role
 */
export const isAdmin = cache(async function isAdmin(
  userId: string
): Promise<boolean> {
  if (!userId) return false;

  const cacheKey = `${REDIS_KEY_PREFIX}${userId}`;
  const redis = getRedis();

  // 1. Try Redis first (distributed cache)
  if (redis) {
    const redisResult = await tryRedisPath(userId, cacheKey, redis);
    if (redisResult !== null) return redisResult;
  }

  // 2. Fallback to in-memory cache
  const now = Date.now();
  const memCached = fallbackCache.get(userId);

  if (memCached && now < memCached.expiresAt) {
    return memCached.isAdmin;
  }

  // Query database with retry
  const dbResult = await queryWithRetry(userId);
  if ('result' in dbResult) {
    pruneFallbackCache(now);
    fallbackCache.set(userId, {
      isAdmin: dbResult.result,
      expiresAt: now + MEMORY_CACHE_TTL_MS,
    });
    return dbResult.result;
  }

  return handleDbFailure(userId, memCached, dbResult.error);
});

/**
 * Invalidate the admin role cache for a specific user.
 * Call this after granting or revoking admin privileges.
 * Clears both Redis and memory cache for immediate effect.
 *
 * @param userId - Clerk user ID
 */
export function invalidateAdminCache(userId: string): void {
  // Clear memory cache
  fallbackCache.delete(userId);

  // Clear Redis cache (best-effort, async)
  const redis = getRedis();
  if (redis) {
    const cacheKey = `${REDIS_KEY_PREFIX}${userId}`;
    redis.del(cacheKey).catch(error => {
      captureWarning('[admin/roles] Failed to invalidate Redis cache', {
        error,
      });
    });
  }
}

/**
 * Clear the entire admin role cache.
 * Useful for testing or after bulk role updates.
 * Note: Only clears memory cache, not Redis (to avoid affecting other instances).
 */
export function clearAdminCache(): void {
  fallbackCache.clear();
}
