import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { redis } from '@/lib/redis';

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
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 1 minute fallback
const REDIS_KEY_PREFIX = 'admin:role:';
const MAX_FALLBACK_CACHE_SIZE = 100; // Max users to cache in memory

// Keep in-memory cache as fallback when Redis unavailable
const fallbackCache = new Map<
  string,
  { isAdmin: boolean; expiresAt: number }
>();

/**
 * Prune expired entries and enforce max cache size.
 * Called before adding new entries to prevent unbounded memory growth.
 */
function pruneFallbackCache(now: number): void {
  // First pass: remove expired entries
  for (const [key, entry] of fallbackCache) {
    if (entry.expiresAt <= now) {
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
 * Extracted for reuse in both Redis and memory cache paths.
 * @internal
 */
async function queryAdminRoleFromDB(userId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    return user?.isAdmin ?? false;
  } catch (error) {
    captureError('[admin/roles] Failed to check admin status', error);
    // Fail closed - deny access on error
    return false;
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

  // 1. Try Redis first (distributed cache)
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);

      if (cached !== null) {
        return cached === '1'; // '1' = admin, '0' = not admin
      }

      // Cache miss - query database
      const isUserAdmin = await queryAdminRoleFromDB(userId);

      // Store in Redis with TTL
      await redis.set(cacheKey, isUserAdmin ? '1' : '0', {
        ex: REDIS_CACHE_TTL_SECONDS,
      });

      return isUserAdmin;
    } catch (error) {
      captureWarning(
        '[admin/roles] Redis cache failed, falling back to memory',
        {
          error,
        }
      );
      // Fall through to memory cache
    }
  }

  // 2. Fallback to in-memory cache
  const now = Date.now();
  const memCached = fallbackCache.get(userId);

  if (memCached && now < memCached.expiresAt) {
    return memCached.isAdmin;
  }

  // Query database
  const isUserAdmin = await queryAdminRoleFromDB(userId);

  // Prune cache before adding new entry to prevent memory leaks
  pruneFallbackCache(now);

  // Store in memory cache
  fallbackCache.set(userId, {
    isAdmin: isUserAdmin,
    expiresAt: now + MEMORY_CACHE_TTL_MS,
  });

  return isUserAdmin;
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
