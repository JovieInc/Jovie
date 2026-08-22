export const ACTIONS_CACHE_GC_SCHEMA = 'jovie-actions-cache-gc/v1';
export const KEEP_UNIQUE_TURBO_KEYS = 2;
export const MAX_DELETES_PER_RUN = 100;

const TURBO_KEY_RE = /(?:^|-)turbo-/i;
const PROTECTED_KEY_RE = /pnpm|node-cache|playwright/i;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function asCache(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = Number(entry.id);
  if (!Number.isInteger(id) || id < 1) return null;
  const key = String(entry.key ?? '');
  if (!nonEmpty(key)) return null;
  const accessed = Date.parse(String(entry.last_accessed_at ?? ''));
  const created = Date.parse(String(entry.created_at ?? ''));
  return {
    id,
    key,
    ref: String(entry.ref ?? ''),
    sizeInBytes: Number(entry.size_in_bytes) || 0,
    lastAccessedAt: Number.isFinite(accessed) ? accessed : 0,
    createdAt: Number.isFinite(created) ? created : 0,
  };
}

function recency(cache) {
  return Math.max(cache.lastAccessedAt, cache.createdAt, cache.id);
}

function byRecencyDesc(left, right) {
  return recency(right) - recency(left);
}

export function isProtectedCacheKey(key) {
  return PROTECTED_KEY_RE.test(String(key ?? ''));
}

export function isTurboCacheKey(key) {
  const value = String(key ?? '');
  return TURBO_KEY_RE.test(value) && !isProtectedCacheKey(value);
}

export function classifyCacheKey(key) {
  if (isProtectedCacheKey(key)) return 'protected';
  if (isTurboCacheKey(key)) return 'turbo';
  return 'other';
}

/**
 * Evict stale/duplicate Linux-turbo-* (and other OS turbo) caches.
 * Never delete pnpm, node-cache, or playwright caches.
 * @param {object} [input]
 */
export function planActionsCacheGc({
  caches = [],
  keepUniqueTurboKeys = KEEP_UNIQUE_TURBO_KEYS,
  maxDeletes = MAX_DELETES_PER_RUN,
} = {}) {
  const keepUnique = Number.isInteger(keepUniqueTurboKeys)
    ? Math.max(1, keepUniqueTurboKeys)
    : KEEP_UNIQUE_TURBO_KEYS;
  const deleteCap = Number.isInteger(maxDeletes)
    ? Math.max(1, maxDeletes)
    : MAX_DELETES_PER_RUN;

  const records = (Array.isArray(caches) ? caches : [])
    .map(asCache)
    .filter(Boolean);
  const protectedCaches = records.filter(
    cache => classifyCacheKey(cache.key) === 'protected'
  );
  const otherCaches = records.filter(
    cache => classifyCacheKey(cache.key) === 'other'
  );
  const turboCaches = records.filter(
    cache => classifyCacheKey(cache.key) === 'turbo'
  );

  const byKey = new Map();
  for (const cache of turboCaches) {
    const group = byKey.get(cache.key) ?? [];
    group.push(cache);
    byKey.set(cache.key, group);
  }

  const uniqueKeys = [...byKey.entries()]
    .map(([key, group]) => ({
      key,
      newest: group.reduce((best, cache) =>
        recency(cache) > recency(best) ? cache : best
      ),
      group,
    }))
    .slice()
    .sort((left, right) => byRecencyDesc(left.newest, right.newest));

  const keptKeys = new Set(
    uniqueKeys.slice(0, keepUnique).map(entry => entry.key)
  );
  const deleteCandidates = [];

  for (const { key, group } of uniqueKeys) {
    const sorted = group.slice().sort(byRecencyDesc);
    if (!keptKeys.has(key)) {
      deleteCandidates.push(...sorted);
      continue;
    }
    deleteCandidates.push(...sorted.slice(1));
  }

  const protectedIds = new Set(protectedCaches.map(cache => cache.id));
  const deletions = [];
  for (const cache of deleteCandidates) {
    if (protectedIds.has(cache.id)) continue;
    if (isProtectedCacheKey(cache.key)) continue;
    if (!isTurboCacheKey(cache.key)) continue;
    deletions.push(cache);
    if (deletions.length >= deleteCap) break;
  }

  return {
    schema: ACTIONS_CACHE_GC_SCHEMA,
    scanned: records.length,
    turbo: turboCaches.length,
    protected: protectedCaches.length,
    other: otherCaches.length,
    keptUniqueTurboKeys: [...keptKeys],
    deleteCount: deletions.length,
    deletions: deletions.map(cache => ({
      id: cache.id,
      key: cache.key,
      ref: cache.ref,
      sizeInBytes: cache.sizeInBytes,
    })),
  };
}
