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
  const redis = getRedis();

  // Try Redis cache first to avoid cold Neon DB queries
  if (redis) {
    try {
      const cacheStart = Date.now();
      const cached = await redis.get<ProxyUserState>(cacheKey);
      const cacheDuration = Date.now() - cacheStart;

      if (cached) {
        // Track cache hit for performance monitoring
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

      // Track cache miss
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
      // Log but don't fail - fall through to DB query
      captureWarning('[proxy-state] Redis cache read failed', {
        error: cacheError,
      });
    }
  }

  try {
    // Single query with join - optimized for proxy performance
    // Filter out deleted and banned users to prevent misrouting
    // Wrapped with timeout to prevent hanging on Neon cold starts
    const dbQueryStart = Date.now();
    const queryPromise = db
      .select({
        dbUserId: users.id,
        userStatus: users.userStatus, // Single source of truth for user lifecycle state
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
          isNull(users.deletedAt), // Exclude soft-deleted users
          ne(users.userStatus, 'banned') // Exclude banned users
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

    let userState: ProxyUserState;

    // DB user exists → check lifecycle state
    if (result?.dbUserId) {
      // Check waitlist approval using userStatus lifecycle
      // userStatus progression: waitlist_pending → waitlist_approved → profile_claimed → onboarding_incomplete → active
      const isWaitlistApproved =
        result.userStatus === 'waitlist_approved' ||
        result.userStatus === 'profile_claimed' ||
        result.userStatus === 'onboarding_incomplete' ||
        result.userStatus === 'active';

      if (!isWaitlistApproved) {
        userState = {
          needsWaitlist: true,
          needsOnboarding: false,
          isActive: false,
        };
      } else if (!result.profileId || !result.profileComplete) {
        // Has waitlist approval but no profile or incomplete profile → needs onboarding
        userState = {
          needsWaitlist: false,
          needsOnboarding: true,
          isActive: false,
        };
      } else {
        // Fully active user
        userState = {
          needsWaitlist: false,
          needsOnboarding: false,
          isActive: true,
        };
      }
    } else {
      // No DB user → needs waitlist/signup
      userState = {
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      };
    }

    // Cache the result in Redis (fire-and-forget)
    if (redis) {
      redis
        .set(cacheKey, userState, { ex: USER_STATE_CACHE_TTL_SECONDS })
        .catch(cacheError => {
          captureWarning('[proxy-state] Redis cache write failed', {
            error: cacheError,
          });
        });
    }

    return userState;
  } catch (error) {
    // Log error with context for debugging
    await captureError('Database query failed in proxy state check', error, {
      clerkUserId,
      operation: 'getProxyUserState',
    });

    // Safe fallback: treat as needing waitlist to avoid exposing app to unauthorized access
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
