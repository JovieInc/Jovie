import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import {
  type ProxyUserStateProjection,
  resolveCanonicalState,
  toProxyUserState,
} from '@/lib/auth/canonical-user-state';
import { db } from '@/lib/db';
import { isRetryableError, withRetry } from '@/lib/db/client/retry';
import { QueryTimeoutError } from '@/lib/db/query-timeout';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';

export type ProxyUserState = ProxyUserStateProjection;

// Redis cache settings for user state
// Transitional users get shorter TTL, active users get longer TTL.
// Safe to use longer TTLs because all state transitions (waitlist approval,
// onboarding completion, user deletion) explicitly call invalidateProxyUserStateCache().
const USER_STATE_CACHE_KEY_PREFIX = 'proxy:user-state:';
const USER_STATE_STALE_CACHE_KEY_PREFIX = 'proxy:user-state:stale:';
const USER_STATE_CACHE_TTL_SECONDS = 120; // 2 minutes - transitional users (invalidation is explicit)
const USER_STATE_CACHE_TTL_ACTIVE_SECONDS = 300; // 5 minutes - stable active users
// Longer-lived stale snapshot used when the primary cache expires but Neon is
// still waking up. State transitions call invalidateProxyUserStateCache() so
// stale entries cannot outlive an explicit status change.
const USER_STATE_STALE_CACHE_TTL_SECONDS = 1800; // 30 minutes
const USER_STATE_STALE_CACHE_TTL_ACTIVE_SECONDS = 3600; // 1 hour - stable active users

// Timeout for DB query to prevent proxy hanging on Neon cold starts.
// Kept below the Neon p99 cold-start budget (~3 s) so that a single cache-miss
// does not block authenticated navigations for more than ~3 s. Retries are
// intentionally disabled for this query (maxRetries: 1) — retrying on timeout
// compounds latency rather than reducing it.
const DB_QUERY_TIMEOUT_MS = 3000; // 3 seconds

// Timeout for Redis cache reads. Upstash REST calls are normally <50 ms but
// can stall under network partitions; cap them so a Redis hiccup does not add
// seconds to every authenticated page load.
const REDIS_CACHE_TIMEOUT_MS = 500; // 500 ms

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
 * - Banned/deleted users: 2 minutes - invalidation is explicit on status change
 */
function getTtlForUserState(state: ProxyUserState): number {
  if (state.isActive) return USER_STATE_CACHE_TTL_ACTIVE_SECONDS;
  return USER_STATE_CACHE_TTL_SECONDS;
}

function getStaleTtlForUserState(state: ProxyUserState): number {
  if (state.isActive) return USER_STATE_STALE_CACHE_TTL_ACTIVE_SECONDS;
  return USER_STATE_STALE_CACHE_TTL_SECONDS;
}

function getStaleCacheKey(cacheKey: string): string {
  return cacheKey.replace(
    USER_STATE_CACHE_KEY_PREFIX,
    USER_STATE_STALE_CACHE_KEY_PREFIX
  );
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
    const redisTimeoutPromise = new Promise<null>(resolve => {
      setTimeout(() => resolve(null), REDIS_CACHE_TIMEOUT_MS);
    });
    const cached = await Promise.race([
      redis.get<ProxyUserState>(cacheKey),
      redisTimeoutPromise,
    ]);
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

/**
 * Try to get user state from the longer-lived stale Redis snapshot.
 * Used when the primary cache has expired and the DB is slow or timing out.
 */
async function tryGetStaleCachedState(
  cacheKey: string,
  clerkUserId: string
): Promise<ProxyUserState | null> {
  const redis = getRedis();
  if (!redis) return null;

  const staleCacheKey = getStaleCacheKey(cacheKey);

  try {
    const cacheStart = Date.now();
    const redisTimeoutPromise = new Promise<null>(resolve => {
      setTimeout(() => resolve(null), REDIS_CACHE_TIMEOUT_MS);
    });
    const cached = await Promise.race([
      redis.get<ProxyUserState>(staleCacheKey),
      redisTimeoutPromise,
    ]);
    const cacheDuration = Date.now() - cacheStart;

    if (cached) {
      Sentry.addBreadcrumb({
        category: 'proxy-state',
        message: 'Stale cache hit',
        level: 'info',
        data: {
          cacheKey: staleCacheKey.replace(clerkUserId, '[REDACTED]'),
          durationMs: cacheDuration,
          userState: getUserStateLabel(cached),
        },
      });
      return cached;
    }
  } catch (cacheError) {
    captureWarning('[proxy-state] Redis stale cache read failed', {
      error: cacheError,
    });
  }

  return null;
}

type ProxyStateQueryResult = {
  dbUserId: string;
  userStatus: string | null;
  deletedAt: Date | null;
  profileId: string | null;
  profileComplete: Date | null;
  profileUsername: string | null;
  profileUsernameNormalized: string | null;
  profileDisplayName: string | null;
  profileIsPublic: boolean | null;
};

/**
 * Determine user state from database query result via the canonical resolver.
 */
function determineUserState(
  result: ProxyStateQueryResult | undefined,
  waitlistEnabled: boolean
): ProxyUserState {
  const canonicalState = resolveCanonicalState({
    isAuthenticated: true,
    hasDbUser: Boolean(result?.dbUserId),
    userStatus: result?.userStatus ?? null,
    deletedAt: result?.deletedAt ?? null,
    waitlistGateEnabled: waitlistEnabled,
    profile: result?.profileId
      ? {
          username: result.profileUsername,
          usernameNormalized: result.profileUsernameNormalized,
          displayName: result.profileDisplayName,
          isPublic: result.profileIsPublic,
          onboardingCompletedAt: result.profileComplete,
        }
      : null,
  });

  return toProxyUserState(canonicalState);
}

/**
 * Cache user state in Redis (fire-and-forget)
 */
function cacheUserState(
  cacheKey: string,
  userState: ProxyUserState,
  ttlSeconds: number,
  staleTtlSeconds: number
): void {
  const redis = getRedis();
  if (!redis) return;

  const staleCacheKey = getStaleCacheKey(cacheKey);

  Promise.all([
    redis.set(cacheKey, userState, { ex: ttlSeconds }),
    redis.set(staleCacheKey, userState, { ex: staleTtlSeconds }),
  ]).catch(cacheError => {
    captureWarning('[proxy-state] Redis cache write failed', {
      error: cacheError,
    });
  });
}

/** Fallback when middleware cannot resolve Clerk identity. */
const NEEDS_ONBOARDING_STATE: ProxyUserState = toProxyUserState(
  resolveCanonicalState({
    isAuthenticated: true,
    hasDbUser: false,
    userStatus: null,
    deletedAt: null,
    waitlistGateEnabled: true,
    profile: null,
  })
);

/**
 * Execute the database query with retry logic and per-attempt timeouts.
 *
 * Uses `withRetry` to recover from Neon cold starts (which can take several
 * seconds). Each attempt is capped by DB_QUERY_TIMEOUT_MS so the proxy never
 * hangs indefinitely. A QueryTimeoutError is thrown on timeout so callers can
 * distinguish transient timeouts from other failures.
 */
async function executeUserStateQuery(clerkUserId: string) {
  return withRetry(
    async () => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const queryPromise = db
        .select({
          dbUserId: users.id,
          userStatus: users.userStatus,
          deletedAt: users.deletedAt,
          profileId: creatorProfiles.id,
          profileComplete: creatorProfiles.onboardingCompletedAt,
          profileUsername: creatorProfiles.username,
          profileUsernameNormalized: creatorProfiles.usernameNormalized,
          profileDisplayName: creatorProfiles.displayName,
          profileIsPublic: creatorProfiles.isPublic,
        })
        .from(users)
        .leftJoin(
          creatorProfiles,
          eq(creatorProfiles.id, users.activeProfileId)
        )
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new QueryTimeoutError(
                `[proxy-state] DB query timed out after ${DB_QUERY_TIMEOUT_MS}ms`
              )
            ),
          DB_QUERY_TIMEOUT_MS
        );
      });

      try {
        return await Promise.race([queryPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId!);
      }
      // maxRetries: 1 disables retries for proxy state — retrying a timed-out DB
      // query compounds latency. Failures fall through to DEFAULT_WAITLIST_STATE.
    },
    'proxy_user_state_query',
    1
  );
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
    return { ...NEEDS_ONBOARDING_STATE };
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

  // Layer 3: Database query + waitlist gate (parallel — both are cache-miss work)
  try {
    const dbQueryStart = Date.now();
    const [[result], gateEnabled] = await Promise.all([
      executeUserStateQuery(clerkUserId),
      isWaitlistGateEnabled(),
    ]);
    const dbQueryDuration = Date.now() - dbQueryStart;

    logDbQueryPerformance(dbQueryDuration, !!result?.dbUserId);

    const userState = determineUserState(result, gateEnabled);

    // Populate both cache layers
    setMemoryCachedState(cacheKey, userState);
    const ttl = getTtlForUserState(userState);
    const staleTtl = getStaleTtlForUserState(userState);
    cacheUserState(cacheKey, userState, ttl, staleTtl);

    return userState;
  } catch (error) {
    const isTimeout = error instanceof QueryTimeoutError;
    const isTransient = isTimeout || isRetryableError(error);

    const staleCached = await tryGetStaleCachedState(cacheKey, clerkUserId);
    if (staleCached) {
      await captureWarning(
        '[proxy-state] Serving stale cache after DB failure',
        error,
        {
          clerkUserId,
          operation: 'getProxyUserState',
          errorType: isTransient ? 'transient' : 'persistent',
          fallback: 'stale-cache',
        }
      );
      setMemoryCachedState(cacheKey, staleCached);
      return staleCached;
    }

    if (isTimeout) {
      await captureWarning(
        '[proxy-state] DB query timed out without stale cache fallback',
        error,
        {
          clerkUserId,
          operation: 'getProxyUserState',
          errorType: 'transient',
          fallback: 'needs-onboarding',
        }
      );
    } else {
      await captureError('Database query failed in proxy state check', error, {
        clerkUserId,
        operation: 'getProxyUserState',
        errorType: isTransient ? 'transient' : 'persistent',
        fallback: 'needs-onboarding',
      });
    }

    return { ...NEEDS_ONBOARDING_STATE };
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
    await Promise.all([
      redis.del(cacheKey),
      redis.del(getStaleCacheKey(cacheKey)),
    ]);
  } catch (error) {
    captureWarning('[proxy-state] Failed to invalidate cache', { error });
  }
}
