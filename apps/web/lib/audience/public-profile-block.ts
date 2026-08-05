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
const VISITOR_DECISION_CACHE_KEY_PREFIX = 'proxy:audience-block:visitor:';
const MEMORY_CACHE_TTL_MS = 10_000; // 10s — collapse rapid navigations per isolate
const REDIS_CACHE_TTL_SECONDS = 60; // ≤60s per audit acceptance criteria
const REDIS_CACHE_TIMEOUT_MS = 500;
const MEMORY_CACHE_MAX_ENTRIES = 1_000;

type SentryModule = typeof import('@sentry/nextjs');

let sentryModulePromise: Promise<SentryModule> | null = null;

type VisitorDecision = 'allowed' | 'blocked';
type MemoryCacheKind = 'negative' | 'has-blocks' | VisitorDecision;
type ProfileBlockState = 'has-blocks' | 'negative';

interface MemoryCacheEntry {
  kind: MemoryCacheKind;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();
const profileCacheEpochs = new Map<string, number>();
const profileStateRefreshes = new Map<string, Promise<ProfileBlockState>>();
const visitorDecisionRefreshes = new Map<string, Promise<VisitorDecision>>();

function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

function negativeCacheKey(username: string): string {
  return `${NEGATIVE_CACHE_KEY_PREFIX}${normalizeUsername(username)}`;
}

function hasBlocksCacheKey(username: string): string {
  return `${HAS_BLOCKS_CACHE_KEY_PREFIX}${normalizeUsername(username)}`;
}

function visitorDecisionCacheKey(
  username: string,
  fingerprint: string
): string {
  return `${VISITOR_DECISION_CACHE_KEY_PREFIX}${normalizeUsername(username)}:${fingerprint}`;
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

function clearVisitorMemoryCache(username: string): void {
  const keyPrefix = `${VISITOR_DECISION_CACHE_KEY_PREFIX}${normalizeUsername(username)}:`;
  for (const cacheKey of memoryCache.keys()) {
    if (cacheKey.startsWith(keyPrefix)) memoryCache.delete(cacheKey);
  }
}

function getProfileCacheEpoch(username: string): number {
  return profileCacheEpochs.get(normalizeUsername(username)) ?? 0;
}

function advanceProfileCacheEpoch(username: string): void {
  const normalized = normalizeUsername(username);
  if (
    !profileCacheEpochs.has(normalized) &&
    profileCacheEpochs.size >= MEMORY_CACHE_MAX_ENTRIES
  ) {
    const firstKey = profileCacheEpochs.keys().next().value;
    if (firstKey) profileCacheEpochs.delete(firstKey);
  }
  profileCacheEpochs.set(normalized, getProfileCacheEpoch(normalized) + 1);
  profileStateRefreshes.delete(normalized);

  const visitorKeyPrefix = `${VISITOR_DECISION_CACHE_KEY_PREFIX}${normalized}:`;
  for (const cacheKey of visitorDecisionRefreshes.keys()) {
    if (cacheKey.startsWith(visitorKeyPrefix)) {
      visitorDecisionRefreshes.delete(cacheKey);
    }
  }
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

async function withRedisDeadline<T>(params: {
  readonly cacheKey: string;
  readonly fallback: T;
  readonly operation: (
    redis: NonNullable<ReturnType<typeof getRedis>>
  ) => Promise<T>;
  readonly telemetryKey?: string;
  readonly warning: string;
}): Promise<T> {
  const controller = new AbortController();
  const redis = getRedis({ signal: controller.signal });
  if (!redis) return params.fallback;

  const timeoutId = setTimeout(
    () => controller.abort(),
    REDIS_CACHE_TIMEOUT_MS
  );
  try {
    return await params.operation(redis);
  } catch (error) {
    captureAudienceBlockWarning(params.warning, {
      cacheKey: params.telemetryKey ?? params.cacheKey,
      error,
    });
    return params.fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryGetRedisFlag(cacheKey: string): Promise<boolean> {
  const cacheStart = Date.now();
  const cached = await withRedisDeadline({
    cacheKey,
    fallback: null as boolean | null,
    operation: redis => redis.get<boolean>(cacheKey),
    warning: '[audience-block] Redis cache read failed',
  });
  const cacheDuration = Date.now() - cacheStart;

  addAudienceBlockBreadcrumb({
    cacheKey,
    durationMs: cacheDuration,
    message: cached ? 'Cache hit' : 'Cache miss',
  });
  return cached === true;
}

async function setRedisFlag(cacheKey: string): Promise<void> {
  await withRedisDeadline({
    cacheKey,
    fallback: undefined,
    operation: async redis => {
      await redis.set(cacheKey, true, { ex: REDIS_CACHE_TTL_SECONDS });
    },
    warning: '[audience-block] Redis cache write failed',
  });
}

async function deleteRedisFlag(cacheKey: string): Promise<void> {
  await withRedisDeadline({
    cacheKey,
    fallback: undefined,
    operation: async redis => {
      await redis.del(cacheKey);
    },
    warning: '[audience-block] Redis cache delete failed',
  });
}

async function getVisitorDecision(
  username: string,
  fingerprint: string
): Promise<VisitorDecision | null> {
  const cacheKey = visitorDecisionCacheKey(username, fingerprint);
  if (tryGetMemoryCache(cacheKey, 'blocked')) return 'blocked';
  if (tryGetMemoryCache(cacheKey, 'allowed')) return 'allowed';

  const cached = await withRedisDeadline({
    cacheKey,
    fallback: null as VisitorDecision | null,
    operation: redis => redis.get<VisitorDecision>(cacheKey),
    telemetryKey: `visitor:${normalizeUsername(username)}`,
    warning: '[audience-block] Redis visitor cache read failed',
  });
  if (cached === 'blocked' || cached === 'allowed') {
    setMemoryCache(cacheKey, cached);
    return cached;
  }
  return null;
}

async function setVisitorDecision(
  username: string,
  fingerprint: string,
  decision: VisitorDecision
): Promise<void> {
  const cacheKey = visitorDecisionCacheKey(username, fingerprint);
  setMemoryCache(cacheKey, decision);
  await withRedisDeadline({
    cacheKey,
    fallback: undefined,
    operation: async redis => {
      await redis.set(cacheKey, decision, { ex: REDIS_CACHE_TTL_SECONDS });
    },
    telemetryKey: `visitor:${normalizeUsername(username)}`,
    warning: '[audience-block] Redis visitor cache write failed',
  });
}

async function setNegativeCache(username: string): Promise<void> {
  const cacheKey = negativeCacheKey(username);
  setMemoryCache(cacheKey, 'negative');
  await setRedisFlag(cacheKey);
}

async function setHasBlocksFlag(username: string): Promise<void> {
  const cacheKey = hasBlocksCacheKey(username);
  setMemoryCache(cacheKey, 'has-blocks');
  await setRedisFlag(cacheKey);
}

async function clearHasBlocksFlag(username: string): Promise<void> {
  const cacheKey = hasBlocksCacheKey(username);
  clearMemoryCache(cacheKey);
  await deleteRedisFlag(cacheKey);
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
  advanceProfileCacheEpoch(normalized);
  clearMemoryCache(negativeCacheKey(normalized));
  clearMemoryCache(hasBlocksCacheKey(normalized));
  clearVisitorMemoryCache(normalized);
  await Promise.all([
    deleteRedisFlag(negativeCacheKey(normalized)),
    deleteRedisFlag(hasBlocksCacheKey(normalized)),
  ]);
}

/**
 * Mark a profile as having active audience blocks.
 * Clears any negative cache so middleware re-checks Postgres.
 */
export async function markProfileHasAudienceBlocks(
  username: string,
  blockedFingerprint?: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  advanceProfileCacheEpoch(normalized);
  clearMemoryCache(negativeCacheKey(normalized));
  await Promise.all([
    deleteRedisFlag(negativeCacheKey(normalized)),
    setHasBlocksFlag(normalized),
    blockedFingerprint
      ? setVisitorDecision(normalized, blockedFingerprint, 'blocked')
      : Promise.resolve(),
  ]);
}

/**
 * Mark a profile as having no active audience blocks.
 * Used after the final unblock so middleware can skip Postgres again.
 */
export async function markProfileHasNoAudienceBlocks(
  username: string,
  allowedFingerprint?: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  advanceProfileCacheEpoch(normalized);
  await Promise.all([
    clearHasBlocksFlag(normalized),
    setNegativeCache(normalized),
    allowedFingerprint
      ? setVisitorDecision(normalized, allowedFingerprint, 'allowed')
      : Promise.resolve(),
  ]);
}

/**
 * Clear one visitor's positive decision while a profile still has other
 * active blocks. The profile-level has-blocks flag remains authoritative.
 */
export async function markProfileVisitorAllowed(
  username: string,
  fingerprint: string
): Promise<void> {
  const normalized = normalizeUsername(username);
  advanceProfileCacheEpoch(normalized);
  await setVisitorDecision(normalized, fingerprint, 'allowed');
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

async function resolveProfileBlockStateUncached(
  username: string,
  cacheEpoch: number
): Promise<ProfileBlockState> {
  // Read both shared flags in one bounded parallel window. A positive
  // has-blocks decision always wins if a prior cache mutation was partially
  // applied, preventing a stale negative flag from bypassing a real block.
  const [hasBlocksFlag, negativeCacheHit] = await Promise.all([
    isHasBlocksFlagSet(username),
    isNegativeCacheHit(username),
  ]);

  if (hasBlocksFlag) return 'has-blocks';
  if (negativeCacheHit) return 'negative';

  const hasBlocks = await profileHasActiveBlocks(username);
  const state: ProfileBlockState = hasBlocks ? 'has-blocks' : 'negative';

  // A concurrent block/unblock mutation owns the newer cache state. Do not
  // let an older database read overwrite it after the action completes.
  if (getProfileCacheEpoch(username) !== cacheEpoch) return state;

  if (hasBlocks) {
    await setHasBlocksFlag(username);
  } else {
    await setNegativeCache(username);
  }
  return state;
}

function resolveProfileBlockState(
  username: string
): Promise<ProfileBlockState> {
  const normalized = normalizeUsername(username);
  const existing = profileStateRefreshes.get(normalized);
  if (existing) return existing;

  const cacheEpoch = getProfileCacheEpoch(normalized);
  const refresh = resolveProfileBlockStateUncached(
    normalized,
    cacheEpoch
  ).finally(() => {
    if (profileStateRefreshes.get(normalized) === refresh) {
      profileStateRefreshes.delete(normalized);
    }
  });
  profileStateRefreshes.set(normalized, refresh);
  return refresh;
}

function resolveVisitorDecision(
  username: string,
  fingerprint: string
): Promise<VisitorDecision> {
  const normalized = normalizeUsername(username);
  const cacheKey = visitorDecisionCacheKey(normalized, fingerprint);
  const existing = visitorDecisionRefreshes.get(cacheKey);
  if (existing) return existing;

  const cacheEpoch = getProfileCacheEpoch(normalized);
  const refresh = (async () => {
    const cachedDecision = await getVisitorDecision(normalized, fingerprint);
    if (cachedDecision) return cachedDecision;

    const isBlocked = await isVisitorBlockedByFingerprint(
      normalized,
      fingerprint
    );
    const decision: VisitorDecision = isBlocked ? 'blocked' : 'allowed';
    if (getProfileCacheEpoch(normalized) === cacheEpoch) {
      await setVisitorDecision(normalized, fingerprint, decision);
    }
    return decision;
  })().finally(() => {
    if (visitorDecisionRefreshes.get(cacheKey) === refresh) {
      visitorDecisionRefreshes.delete(cacheKey);
    }
  });
  visitorDecisionRefreshes.set(cacheKey, refresh);
  return refresh;
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
    const profileState = await resolveProfileBlockState(normalizedUsername);
    if (profileState === 'negative') return false;

    const fingerprint = await createFingerprintEdge(ip, ua);
    const visitorDecision = await resolveVisitorDecision(
      normalizedUsername,
      fingerprint
    );
    return visitorDecision === 'blocked';
  } catch {
    return false;
  }
}
