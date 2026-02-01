import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

export interface ProxyUserState {
  needsWaitlist: boolean;
  needsOnboarding: boolean;
  isActive: boolean;
}

// Redis cache settings for user state
// Short TTL to balance freshness vs cold DB latency
const USER_STATE_CACHE_KEY_PREFIX = 'proxy:user-state:';
const USER_STATE_CACHE_TTL_SECONDS = 30; // 30 seconds - short for routing decisions

// Timeout for DB query to prevent proxy hanging on Neon cold starts
const DB_QUERY_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Try to get user state from Redis cache
 */
async function tryGetCachedState(
  cacheKey: string,
  clerkUserId: string
): Promise<ProxyUserState | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cacheStart = Date.now();
    const cached = await redis.get<ProxyUserState>(cacheKey);
    const cacheDuration = Date.now() - cacheStart;

    if (cached) {
      Sentry.addBreadcrumb({
        category: 'proxy-state',
        message: 'Cache hit',
        level: 'info',
        data: {
          cacheKey: cacheKey.replace(clerkUserId, '[REDACTED]'),
          durationMs: cacheDuration,
          userState: cached.isActive
            ? 'active'
            : cached.needsOnboarding
              ? 'onboarding'
              : 'waitlist',
        },
      });
      return cached;
    }

    Sentry.addBreadcrumb({
      category: 'proxy-state',
      message: 'Cache miss',
      level: 'info',
      data: {
        cacheKey: cacheKey.replace(clerkUserId, '[REDACTED]'),
        durationMs: cacheDuration,
      },
    });
  } catch (cacheError) {
    captureWarning('[proxy-state] Redis cache read failed', { error: cacheError });
  }

  return null;
}

/**
 * Determine user state from database query result
 */
function determineUserState(
  result: {
    dbUserId: string;
    userStatus: string | null;
    profileId: string | null;
    profileComplete: Date | null;
  } | undefined
): ProxyUserState {
  // No DB user → needs waitlist/signup
  if (!result?.dbUserId) {
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }

  // Check waitlist approval using userStatus lifecycle
  const approvedStatuses = [
    'waitlist_approved',
    'profile_claimed',
    'onboarding_incomplete',
    'active',
  ];
  const isWaitlistApproved = approvedStatuses.includes(result.userStatus ?? '');

  if (!isWaitlistApproved) {
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }

  // Has approval but no profile or incomplete → needs onboarding
  if (!result.profileId || !result.profileComplete) {
    return { needsWaitlist: false, needsOnboarding: true, isActive: false };
  }

  // Fully active user
  return { needsWaitlist: false, needsOnboarding: false, isActive: true };
}

/**
 * Cache user state in Redis (fire-and-forget)
 */
function cacheUserState(cacheKey: string, userState: ProxyUserState): void {
  const redis = getRedis();
  if (!redis) return;

  redis
    .set(cacheKey, userState, { ex: USER_STATE_CACHE_TTL_SECONDS })
    .catch(cacheError => {
      captureWarning('[proxy-state] Redis cache write failed', {
        error: cacheError,
      });
    });
}

/**
 * Lightweight user state check for proxy.ts
 *
 * This performs a single optimized query to determine user state for routing.
 * Used by proxy.ts to make ONE auth decision at the edge, eliminating redirect loops.
 *
 * IMPORTANT: Filters out soft-deleted and banned users for security.
 *
 * Uses userStatus lifecycle enum as single source of truth for auth state.
 *
 * @param clerkUserId - The Clerk user ID from auth()
 * @returns Boolean flags indicating what the user needs
 */
export async function getUserState(
  clerkUserId: string
): Promise<ProxyUserState> {
  if (!clerkUserId) {
    captureWarning(
      '[proxy-state] getUserState called with missing clerkUserId'
    );
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }

  const cacheKey = `${USER_STATE_CACHE_KEY_PREFIX}${clerkUserId}`;

  // Try Redis cache first to avoid cold Neon DB queries
  const cached = await tryGetCachedState(cacheKey, clerkUserId);
  if (cached) {
    return cached;
  }

  try {
    // Single query with join - optimized for proxy performance
    // Filter out deleted and banned users to prevent misrouting
    const dbQueryStart = Date.now();
    const queryPromise = db
      .select({
        dbUserId: users.id,
        userStatus: users.userStatus,
        profileId: creatorProfiles.id,
        profileComplete: creatorProfiles.onboardingCompletedAt,
      })
      .from(users)
      .leftJoin(
        creatorProfiles,
        and(
          eq(creatorProfiles.userId, users.id),
          eq(creatorProfiles.isClaimed, true)
        )
      )
      .where(
        and(
          eq(users.clerkId, clerkUserId),
          isNull(users.deletedAt),
          ne(users.userStatus, 'banned')
        )
      )
      .limit(1);

    // Race the query against a timeout to prevent proxy hanging
    const [result] = await Promise.race([
      queryPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('[proxy-state] DB query timeout after 5s')),
          DB_QUERY_TIMEOUT_MS
        )
      ),
    ]);

    const dbQueryDuration = Date.now() - dbQueryStart;

    // Track DB query performance (only on cache miss path)
    Sentry.addBreadcrumb({
      category: 'proxy-state',
      message: 'DB query completed',
      level: dbQueryDuration > 1000 ? 'warning' : 'info',
      data: {
        durationMs: dbQueryDuration,
        userFound: !!result?.dbUserId,
        slow: dbQueryDuration > 1000,
      },
    });

    const userState = determineUserState(result);

    // Cache the result in Redis (fire-and-forget)
    cacheUserState(cacheKey, userState);

    return userState;
  } catch (error) {
    await captureError('Database query failed in proxy state check', error, {
      clerkUserId,
      operation: 'getProxyUserState',
    });

    // Safe fallback: treat as needing waitlist
    return { needsWaitlist: true, needsOnboarding: false, isActive: false };
  }
}

/**
 * Invalidate the Redis cache for a user's proxy state.
 * Call this after user state changes (onboarding completion, waitlist approval, etc.)
 *
 * @param clerkUserId - The Clerk user ID whose state changed
 */
export async function invalidateProxyUserStateCache(
  clerkUserId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const cacheKey = `${USER_STATE_CACHE_KEY_PREFIX}${clerkUserId}`;
  try {
    await redis.del(cacheKey);
  } catch (error) {
    captureWarning('[proxy-state] Failed to invalidate cache', { error });
  }
}
