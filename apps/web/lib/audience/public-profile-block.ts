import 'server-only';

import { createFingerprintEdge } from '@/lib/audience/fingerprint';
import { withTimeout } from '@/lib/db/query-timeout';
import { getRedis } from '@/lib/redis';

// Timeout for audience-block DB queries. Matches proxy-state.ts budget — kept
// below the Neon p99 cold-start budget (~3 s) so a cache-miss does not stall
// every visitor navigation for more than ~3 s. Fails open on timeout.
const AUDIENCE_BLOCK_DB_QUERY_TIMEOUT_MS = 3000;

/**
 * Mirror extractClientIP() priority for the middleware audience-block check.
 */
export function getAudienceBlockIpFromHeaders(headers: Headers): string | null {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    headers.get('true-client-ip') ||
    null
  );
}

// ---------------------------------------------------------------------------
// Multi-layer cache for middleware audience-block checks
// ---------------------------------------------------------------------------
// proxy.ts calls this on every single-segment public-profile candidate. Most
// paths are unknown usernames, typos, or profiles with zero blocks — cache
// those outcomes so scanner floods do not amplify into Postgres JOIN load.
// ---------------------------------------------------------------------------
const NEGATIVE_CACHE_KEY_PREFIX = 'proxy:audience-block:neg:';
const HAS_BLOCKS_CACHE_KEY_PREFIX = 'proxy:audience-block:has:';
const MEMORY_CACHE_TTL_MS = 10_000; // 10s — collapse rapid navigations per isolate
const REDIS_CACHE_TTL_SECONDS = 60; // ≤60s per audit acceptance criteria
const REDIS_CACHE_TIMEOUT_MS = 500;
const MEMORY_CACHE_MAX_ENTRIES = 1_000;

type SentryModule = typeof import('@sentry/nextjs');

let sentryModulePromise: Promise<SentryModule> | null = null;

type MemoryCacheKind = 'negative' | 'has-blocks';

interface MemoryCacheEntry {
  kind: MemoryCacheKind;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

function negativeCacheKey(username: string): string {
  return `${NEGATIVE_CACHE_KEY_PREFIX}${normalizeUsername(username)}`;
}

function hasBlocksCacheKey(username: string): string {
  return `${HAS_BLOCKS_CACHE_KEY_PREFIX}${normalizeUsername(username)}`;
}

function tryGetMemoryCache(
  cacheKey: string,
  kind: MemoryCacheKind
): boolean | null {
  const entry = memoryCache.get(cacheKey);
  if (!entry || entry.kind !== kind) return null;
  if (Date.now() < entry.expiresAt) return true;
  memoryCache.delete(cacheKey);
  return null;
}

function setMemoryCache(cacheKey: string, kind: MemoryCacheKind): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(cacheKey, {
    kind,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  });
}

function clearMemoryCache(cacheKey: string): void {
  memoryCache.delete(cacheKey);
}

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test';
}

function isPublicNoAuthSmoke(): boolean {
  return process.env.PUBLIC_NOAUTH_SMOKE === '1';
}

function isE2ERuntime(): boolean {
  return (
    process.env.NEXT_PUBLIC_E2E_MODE === '1' ||
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1'
  );
}

function isSecureVercelDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'production'
  );
}

function shouldSkipAudienceBlockTelemetry(): boolean {
  // This module is shared by ISR-sensitive public routes and proxy checks.
  // Keep env reads inline so typed server env imports cannot pull request-aware
  // modules into static profile renders.
  if (isSecureVercelDeployment()) {
    return false;
  }

  return process.env.CI === 'true' || isTestRuntime() || isE2ERuntime();
}

function loadSentry(): Promise<SentryModule> {
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/nextjs');
  }
  return sentryModulePromise;
}

function addAudienceBlockBreadcrumb(params: {
  readonly cacheKey: string;
  readonly durationMs: number;
  readonly message: string;
}): void {
  if (shouldSkipAudienceBlockTelemetry()) return;

  void loadSentry()
    .then(Sentry => {
      Sentry.addBreadcrumb({
        category: 'audience-block',
        message: params.message,
        level: 'info',
        data: {
          cacheKey: params.cacheKey,
          durationMs: params.durationMs,
        },
      });
    })
    .catch(() => {});
}

function captureAudienceBlockWarning(
  message: string,
  context: Record<string, unknown>
): void {
  console.warn(message, context);
  if (shouldSkipAudienceBlockTelemetry()) return;

  void loadSentry()
    .then(Sentry => {
      Sentry.captureMessage(message, {
        level: 'warning',
        extra: context,
        tags: { context: 'audience-block' },
      });
    })
    .catch(() => {});
}

async function tryGetRedisFlag(cacheKey: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const cacheStart = Date.now();
    const redisTimeoutPromise = new Promise<null>(resolve => {
      setTimeout(() => resolve(null), REDIS_CACHE_TIMEOUT_MS);
    });
    const cached = await Promise.race([
      redis.get<boolean>(cacheKey),
      redisTimeoutPromise,
    ]);
    const cacheDuration = Date.now() - cacheStart;

    if (cached) {
      addAudienceBlockBreadcrumb({
        cacheKey,
        durationMs: cacheDuration,
        message: 'Cache hit',
      });
      return true;
    }

    addAudienceBlockBreadcrumb({
      cacheKey,
      durationMs: cacheDuration,
      message: 'Cache miss',
    });
  } catch (error) {
    captureAudienceBlockWarning('[audience-block] Redis cache read failed', {
      error,
    });
  }

  return false;
}

function setRedisFlag(cacheKey: string): void {
  const redis = getRedis();
  if (!redis) return;

  redis.set(cacheKey, true, { ex: REDIS_CACHE_TTL_SECONDS }).catch(error => {
    captureAudienceBlockWarning('[audience-block] Redis cache write failed', {
      error,
    });
  });
}

function deleteRedisFlag(cacheKey: string): void {
  const redis = getRedis();
  if (!redis) return;

  redis.del(cacheKey).catch(error => {
    captureAudienceBlockWarning('[audience-block] Redis cache delete failed', {
      error,
    });
  });
}

function setNegativeCache(username: string): void {
  const cacheKey = negativeCacheKey(username);
  setMemoryCache(cacheKey, 'negative');
  setRedisFlag(cacheKey);
}

function setHasBlocksFlag(username: string): void {
  const cacheKey = hasBlocksCacheKey(username);
  setMemoryCache(cacheKey, 'has-blocks');
  setRedisFlag(cacheKey);
}

function clearHasBlocksFlag(username: string): void {
  const cacheKey = hasBlocksCacheKey(username);
  clearMemoryCache(cacheKey);
  deleteRedisFlag(cacheKey);
}

async function isNegativeCacheHit(username: string): Promise<boolean> {
  const cacheKey = negativeCacheKey(username);
  if (tryGetMemoryCache(cacheKey, 'negative')) return true;
  if (await tryGetRedisFlag(cacheKey)) {
    setMemoryCache(cacheKey, 'negative');
    return true;
  }
  return false;
}

async function isHasBlocksFlagSet(username: string): Promise<boolean> {
  const cacheKey = hasBlocksCacheKey(username);
  if (tryGetMemoryCache(cacheKey, 'has-blocks')) return true;
  if (await tryGetRedisFlag(cacheKey)) {
    setMemoryCache(cacheKey, 'has-blocks');
    return true;
  }
  return false;
}

/**
 * Invalidate cached audience-block state for a profile username.
 * Call after block/unblock mutations so middleware sees fresh state.
 */
export async function invalidateProfileAudienceBlockCache(
  username: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  clearMemoryCache(negativeCacheKey(normalized));
  clearMemoryCache(hasBlocksCacheKey(normalized));
  deleteRedisFlag(negativeCacheKey(normalized));
  deleteRedisFlag(hasBlocksCacheKey(normalized));
}

/**
 * Mark a profile as having active audience blocks.
 * Clears any negative cache so middleware re-checks Postgres.
 */
export async function markProfileHasAudienceBlocks(
  username: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  clearMemoryCache(negativeCacheKey(normalized));
  deleteRedisFlag(negativeCacheKey(normalized));
  setHasBlocksFlag(normalized);
}

/**
 * Mark a profile as having no active audience blocks.
 * Used after the final unblock so middleware can skip Postgres again.
 */
export async function markProfileHasNoAudienceBlocks(
  username: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  clearHasBlocksFlag(normalized);
  setNegativeCache(normalized);
}

async function profileHasActiveBlocks(username: string): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const { and, eq, exists, isNull } = await import('drizzle-orm');
  const { audienceBlocks } = await import('@/lib/db/schema/analytics');
  const { creatorProfiles } = await import('@/lib/db/schema/profiles');

  const queryPromise = db
    .select({ profileId: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.username, normalizeUsername(username)),
        exists(
          db
            .select({ id: audienceBlocks.id })
            .from(audienceBlocks)
            .where(
              and(
                eq(audienceBlocks.creatorProfileId, creatorProfiles.id),
                isNull(audienceBlocks.unblockedAt)
              )
            )
        )
      )
    )
    .limit(1);

  const [result] = await withTimeout(
    queryPromise,
    AUDIENCE_BLOCK_DB_QUERY_TIMEOUT_MS,
    '[audience-block] profileHasActiveBlocks'
  );

  return !!result;
}

async function isVisitorBlockedByFingerprint(
  username: string,
  fingerprint: string
): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const { and, eq, isNull } = await import('drizzle-orm');
  const { audienceBlocks } = await import('@/lib/db/schema/analytics');
  const { creatorProfiles } = await import('@/lib/db/schema/profiles');

  const queryPromise = db
    .select({ blockId: audienceBlocks.id })
    .from(creatorProfiles)
    .innerJoin(
      audienceBlocks,
      eq(audienceBlocks.creatorProfileId, creatorProfiles.id)
    )
    .where(
      and(
        eq(creatorProfiles.username, normalizeUsername(username)),
        eq(audienceBlocks.fingerprint, fingerprint),
        isNull(audienceBlocks.unblockedAt)
      )
    )
    .limit(1);

  const [result] = await withTimeout(
    queryPromise,
    AUDIENCE_BLOCK_DB_QUERY_TIMEOUT_MS,
    '[audience-block] isVisitorBlockedByFingerprint'
  );

  return !!result;
}

/**
 * Check if a public profile visitor should be blocked.
 *
 * Uses a bounded in-memory + Redis cache so unknown usernames and profiles
 * without active blocks avoid Postgres on repeat middleware hits. Only
 * profiles with active blocks run the fingerprint JOIN.
 *
 * Fails open on any error. A blocked user slipping through once is preferable
 * to locking out all visitors during a DB hiccup.
 */
export async function checkProfileVisitorBlocked(
  username: string,
  ip: string | null,
  ua: string | null
): Promise<boolean> {
  if (isTestRuntime()) return false;
  if (isPublicNoAuthSmoke()) return false;

  try {
    const normalizedUsername = normalizeUsername(username);

    if (await isNegativeCacheHit(normalizedUsername)) {
      return false;
    }

    if (!(await isHasBlocksFlagSet(normalizedUsername))) {
      const hasBlocks = await profileHasActiveBlocks(normalizedUsername);
      if (!hasBlocks) {
        setNegativeCache(normalizedUsername);
        return false;
      }
      setHasBlocksFlag(normalizedUsername);
    }

    const fingerprint = await createFingerprintEdge(ip, ua);
    return await isVisitorBlockedByFingerprint(normalizedUsername, fingerprint);
  } catch {
    return false;
  }
}
