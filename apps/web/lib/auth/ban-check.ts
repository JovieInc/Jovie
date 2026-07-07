import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { checkUserStatus } from '@/lib/auth/status-checker';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

interface BanStatus {
  isBanned: boolean;
}

interface BanStatusCacheEntry {
  isBanned: boolean;
  cachedAt: string;
}

const BAN_STATUS_CACHE_KEY_PREFIX = 'auth:ban-status:v1:';
const BAN_STATUS_CACHE_TTL_BANNED_SECONDS = 300; // 5 minutes
const BAN_STATUS_CACHE_TTL_ACTIVE_SECONDS = 120; // 2 minutes

function getBanStatusCacheKey(clerkUserId: string): string {
  return `${BAN_STATUS_CACHE_KEY_PREFIX}${clerkUserId}`;
}

function getBanStatusCacheTtlSeconds(isBanned: boolean): number {
  return isBanned
    ? BAN_STATUS_CACHE_TTL_BANNED_SECONDS
    : BAN_STATUS_CACHE_TTL_ACTIVE_SECONDS;
}

async function readCachedBanStatus(
  clerkUserId: string
): Promise<BanStatus | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<BanStatusCacheEntry>(
      getBanStatusCacheKey(clerkUserId)
    );
    if (!cached) return null;

    const entry =
      typeof cached === 'string'
        ? (JSON.parse(cached) as BanStatusCacheEntry)
        : cached;

    if (typeof entry?.isBanned !== 'boolean') return null;

    return { isBanned: entry.isBanned };
  } catch (error) {
    captureWarning('[ban-check] Redis cache read failed', {
      clerkUserId,
      error,
    });
    return null;
  }
}

function writeBanStatusCache(clerkUserId: string, status: BanStatus): void {
  const redis = getRedis();
  if (!redis) return;

  const entry: BanStatusCacheEntry = {
    isBanned: status.isBanned,
    cachedAt: new Date().toISOString(),
  };

  redis
    .set(getBanStatusCacheKey(clerkUserId), entry, {
      ex: getBanStatusCacheTtlSeconds(status.isBanned),
    })
    .catch(error => {
      captureWarning('[ban-check] Redis cache write failed', {
        clerkUserId,
        error,
      });
    });
}

function recordFailOpenTelemetry(clerkUserId: string, error: unknown): void {
  Sentry.addBreadcrumb({
    category: 'ban-check',
    message: 'Fail-open ban check',
    level: 'warning',
    data: {
      clerkUserId: '[REDACTED]',
      reason: 'db_and_cache_unavailable',
    },
  });

  captureWarning('Ban status check failed open after DB and cache miss', {
    clerkUserId,
    error,
  });
}

/**
 * Invalidate the Redis cache for a user's ban status.
 * Call after ban/unban or other status transitions that affect blocking.
 *
 * @param clerkUserId - App `users.id` UUID (post-cutover identity key).
 *   Parameter name preserved for churn reduction.
 */
export async function invalidateBanStatusCache(
  clerkUserId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(getBanStatusCacheKey(clerkUserId));
  } catch (error) {
    captureWarning('[ban-check] Failed to invalidate cache', {
      clerkUserId,
      error,
    });
  }
}

/**
 * Lightweight ban check for the app shell layout.
 *
 * The proxy middleware skips user state lookups for /app/* routes
 * (proxy.ts:581-585), so the middleware-level ban check never fires
 * for dashboard pages. This function fills that gap.
 *
 * @param clerkUserId - App `users.id` UUID (post-cutover identity key,
 *   from `getCachedAuth().userId`). Parameter name preserved for
 *   churn reduction; queries by `users.id`, not `users.clerkId`.
 *
 * Wrapped in React cache() so it's deduplicated per request when
 * called from both the layout and child components.
 */
export const getUserBanStatus = cache(
  async (clerkUserId: string): Promise<BanStatus> => {
    try {
      const [user] = await db
        .select({
          userStatus: users.userStatus,
          deletedAt: users.deletedAt,
        })
        .from(users)
        .where(eq(users.id, clerkUserId))
        .limit(1);

      if (!user) {
        const status = { isBanned: false };
        writeBanStatusCache(clerkUserId, status);
        return status;
      }

      const { isBlocked } = checkUserStatus(user.userStatus, user.deletedAt);
      const status = { isBanned: isBlocked };
      writeBanStatusCache(clerkUserId, status);
      return status;
    } catch (error) {
      const cached = await readCachedBanStatus(clerkUserId);
      if (cached) {
        Sentry.addBreadcrumb({
          category: 'ban-check',
          message: 'Served cached ban status after DB failure',
          level: 'warning',
          data: {
            clerkUserId: '[REDACTED]',
            isBanned: cached.isBanned,
          },
        });

        captureError('Ban status check used cached fallback', error, {
          clerkUserId,
          isBanned: cached.isBanned,
        });

        return cached;
      }

      // Fail open only when both DB and Redis are unavailable. A banned user
      // slipping through briefly is far less impactful than denying the entire
      // user base, but we emit telemetry so the trade-off is visible.
      recordFailOpenTelemetry(clerkUserId, error);
      return { isBanned: false };
    }
  }
);
