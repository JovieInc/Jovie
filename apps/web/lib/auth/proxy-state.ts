import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';

export interface ProxyUserState {
  needsWaitlist: boolean;
  needsOnboarding: boolean;
  isActive: boolean;
}

// Redis cache settings for user state
// Short TTL for transitional users, longer TTL for stable active users
const USER_STATE_CACHE_KEY_PREFIX = 'proxy:user-state:';
const USER_STATE_CACHE_TTL_SECONDS = 30; // 30 seconds - short for transitional users
const USER_STATE_CACHE_TTL_ACTIVE_SECONDS = 300; // 5 minutes - longer for stable active users

// Timeout for DB query to prevent proxy hanging on Neon cold starts
const DB_QUERY_TIMEOUT_MS = 5000; // 5 seconds

/** Get a human-readable label for user state (for logging) */
function getUserStateLabel(state: ProxyUserState): string {
  if (state.isActive) return 'active';
  if (state.needsOnboarding) return 'onboarding';
  return 'waitlist';
}

/**
 * Determine the appropriate cache TTL based on user state.
 * - Active users (stable state): 5 minutes - state rarely changes
 * - Transitional users (waitlist/onboarding): 30 seconds - need fresher state
 */
function getTtlForUserState(state: ProxyUserState): number {
  return state.isActive
    ? USER_STATE_CACHE_TTL_ACTIVE_SECONDS
    : USER_STATE_CACHE_TTL_SECONDS;
}

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
          userState: getUserStateLabel(cached),
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
    captureWarning('[proxy-state] Redis cache read failed', {
      error: cacheError,
    });
  }

  return null;
}

/** Statuses that indicate waitlist approval */
const APPROVED_STATUSES = [
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
] as const;

/**
 * Determine user state from database query result
 */
function determineUserState(
  result:
    | {
        dbUserId: string;
        userStatus: string | null;
        profileId: string | null;
        profileComplete: Date | null;
      }
    | undefined
): ProxyUserState {
  // No DB user → needs waitlist/signup
  if (!result?.dbUserId) {
    return { ...DEFAULT_WAITLIST_STATE };
  }

  // Check waitlist approval using userStatus lifecycle
  const isWaitlistApproved = APPROVED_STATUSES.includes(
    result.userStatus as (typeof APPROVED_STATUSES)[number]
  );

  if (!isWaitlistApproved) {
    return { ...DEFAULT_WAITLIST_STATE };
  }

  // Has approval but no profile or incomplete → needs onboarding
  if (!result.profileId || !result.profileComplete) {
    return { ...NEEDS_ONBOARDING_STATE };
  }

  // Fully active user
  return { ...ACTIVE_USER_STATE };
}

/**
 * Cache user state in Redis (fire-and-forget)
 */
function cacheUserState(
  cacheKey: string,
  userState: ProxyUserState,
  ttlSeconds: number
): void {
  const redis = getRedis();
  if (!redis) return;

  redis.set(cacheKey, userState, { ex: ttlSeconds }).catch(cacheError => {
    captureWarning('[proxy-state] Redis cache write failed', {
      error: cacheError,
    });
  });
}

/** Default state for unauthenticated or unknown users */
const DEFAULT_WAITLIST_STATE: ProxyUserState = {
  needsWaitlist: true,
  needsOnboarding: false,
  isActive: false,
};

/** State for users who need onboarding */
const NEEDS_ONBOARDING_STATE: ProxyUserState = {
  needsWaitlist: false,
  needsOnboarding: true,
  isActive: false,
};

/** State for fully active users */
const ACTIVE_USER_STATE: ProxyUserState = {
  needsWaitlist: false,
  needsOnboarding: false,
  isActive: true,
};

/**
 * Execute the database query with timeout protection
 */
async function executeUserStateQuery(clerkUserId: string) {
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
  return Promise.race([
    queryPromise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('[proxy-state] DB query timeout after 5s')),
        DB_QUERY_TIMEOUT_MS
      )
    ),
  ]);
}

/**
 * Log database query performance to Sentry
 */
function logDbQueryPerformance(durationMs: number, userFound: boolean): void {
  const isSlow = durationMs > 1000;
  Sentry.addBreadcrumb({
    category: 'proxy-state',
    message: 'DB query completed',
    level: isSlow ? 'warning' : 'info',
    data: { durationMs, userFound, slow: isSlow },
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
    return { ...DEFAULT_WAITLIST_STATE };
  }

  const cacheKey = `${USER_STATE_CACHE_KEY_PREFIX}${clerkUserId}`;

  // Try Redis cache first to avoid cold Neon DB queries
  const cached = await tryGetCachedState(cacheKey, clerkUserId);
  if (cached) {
    return cached;
  }

  try {
    const dbQueryStart = Date.now();
    const [result] = await executeUserStateQuery(clerkUserId);
    const dbQueryDuration = Date.now() - dbQueryStart;

    logDbQueryPerformance(dbQueryDuration, !!result?.dbUserId);

    const userState = determineUserState(result);

    // Cache the result in Redis (fire-and-forget)
    const ttl = getTtlForUserState(userState);
    cacheUserState(cacheKey, userState, ttl);

    return userState;
  } catch (error) {
    await captureError('Database query failed in proxy state check', error, {
      clerkUserId,
      operation: 'getProxyUserState',
    });

    return { ...DEFAULT_WAITLIST_STATE };
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
