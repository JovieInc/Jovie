import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { isWaitlistEnabled } from './waitlist-config';

export interface ProxyUserState {
  needsWaitlist: boolean;
  needsOnboarding: boolean;
  isActive: boolean;
}

// Redis cache settings for user state
// Transitional users get shorter TTL, active users get longer TTL.
// Safe to use longer TTLs because all state transitions (waitlist approval,
// onboarding completion, user deletion) explicitly call invalidateProxyUserStateCache().
const USER_STATE_CACHE_KEY_PREFIX = 'proxy:user-state:';
const USER_STATE_CACHE_TTL_SECONDS = 120; // 2 minutes - transitional users (invalidation is explicit)
const USER_STATE_CACHE_TTL_ACTIVE_SECONDS = 300; // 5 minutes - stable active users

// Timeout for DB query to prevent proxy hanging on Neon cold starts
const DB_QUERY_TIMEOUT_MS = 5000; // 5 seconds

// ---------------------------------------------------------------------------
// In-memory cache layer
// ---------------------------------------------------------------------------
// Short-lived Map that sits in front of Redis to collapse rapid-fire middleware
// calls (page load + RSC prefetches + client navigations) into a single
// Redis/DB round-trip. Persists across requests in warm Edge Runtime isolates.
// ---------------------------------------------------------------------------
const MEMORY_CACHE_TTL_ACTIVE_MS = 10_000; // 10s for active users
const MEMORY_CACHE_TTL_TRANSITIONAL_MS = 5_000; // 5s for transitional users
const MEMORY_CACHE_MAX_ENTRIES = 1_000;

interface MemoryCacheEntry {
  state: ProxyUserState;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

function tryGetMemoryCachedState(cacheKey: string): ProxyUserState | null {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() < entry.expiresAt) return entry.state;
  memoryCache.delete(cacheKey);
  return null;
}

function setMemoryCachedState(cacheKey: string, state: ProxyUserState): void {
  // Simple eviction: drop oldest entry when at capacity
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  const ttlMs = state.isActive
    ? MEMORY_CACHE_TTL_ACTIVE_MS
    : MEMORY_CACHE_TTL_TRANSITIONAL_MS;
  memoryCache.set(cacheKey, { state, expiresAt: Date.now() + ttlMs });
}

/** Get a human-readable label for user state (for logging) */
function getUserStateLabel(state: ProxyUserState): string {
  if (state.isActive) return 'active';
  if (state.needsOnboarding) return 'onboarding';
  return 'waitlist';
}

/**
 * Determine the appropriate cache TTL based on user state.
 * - Active users (stable state): 5 minutes - state rarely changes
 * - Transitional users (waitlist/onboarding): 2 minutes - explicit invalidation on state change
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
  const waitlistEnabled = isWaitlistEnabled();

  // No DB user → needs waitlist/signup (or onboarding if waitlist is disabled)
  if (!result?.dbUserId) {
    return waitlistEnabled
      ? { ...DEFAULT_WAITLIST_STATE }
      : { ...NEEDS_ONBOARDING_STATE };
  }

  // Check waitlist approval using userStatus lifecycle
  const isWaitlistApproved = APPROVED_STATUSES.includes(
    result.userStatus as (typeof APPROVED_STATUSES)[number]
  );

  if (!isWaitlistApproved) {
    if (!waitlistEnabled) {
      // Waitlist disabled: skip gate, route based on profile completeness
      if (!result.profileId || !result.profileComplete) {
        return { ...NEEDS_ONBOARDING_STATE };
      }
      return { ...ACTIVE_USER_STATE };
    }
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

  // Layer 1: In-memory cache (avoids Redis round-trip entirely)
  const memoryCached = tryGetMemoryCachedState(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  // Layer 2: Redis cache (avoids cold Neon DB queries)
  const cached = await tryGetCachedState(cacheKey, clerkUserId);
  if (cached) {
    setMemoryCachedState(cacheKey, cached);
    return cached;
  }

  // Layer 3: Database query
  try {
    const dbQueryStart = Date.now();
    const [result] = await executeUserStateQuery(clerkUserId);
    const dbQueryDuration = Date.now() - dbQueryStart;

    logDbQueryPerformance(dbQueryDuration, !!result?.dbUserId);

    const userState = determineUserState(result);

    // Populate both cache layers
    setMemoryCachedState(cacheKey, userState);
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
 * Synchronous check whether a user is known-active from the in-memory cache.
 * Used by proxy.ts to skip getUserState on RSC prefetch requests for active
 * users — they don't need routing intervention so prefetch can pass through.
 */
export function isKnownActiveUser(clerkUserId: string): boolean {
  const cacheKey = `${USER_STATE_CACHE_KEY_PREFIX}${clerkUserId}`;
  const entry = memoryCache.get(cacheKey);
  return !!entry && Date.now() < entry.expiresAt && entry.state.isActive;
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
  const cacheKey = `${USER_STATE_CACHE_KEY_PREFIX}${clerkUserId}`;

  // Clear in-memory cache (only effective within the same isolate, but harmless)
  memoryCache.delete(cacheKey);

  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(cacheKey);
  } catch (error) {
    captureWarning('[proxy-state] Failed to invalidate cache', { error });
  }
}
