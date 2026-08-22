#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const CACHE_COUNT_SOFT_LIMIT = 400;
export const CACHE_BYTES_SOFT_LIMIT = 8 * 1024 * 1024 * 1024;
export const PROTECTED_KEY = /pnpm|node-cache|playwright|setup-node/i;
export const PROTECTED_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const TURBO_KEEP_UNDER_BUDGET = 2;
export const TURBO_KEEP_OVER_BUDGET = 1;

export function isProtectedCacheKey(key) {
  return PROTECTED_KEY.test(String(key ?? ''));
}

export function turboFamily(key) {
  const match = String(key ?? '').match(/^((?:Linux|macOS|Windows)-turbo)/);
  return match ? match[1] : null;
}

export function isOverCacheBudget(usage = {}, cacheCount = 0) {
  return (
    (usage.active_caches_count ?? cacheCount) > CACHE_COUNT_SOFT_LIMIT ||
    (usage.active_caches_size_in_bytes ?? 0) > CACHE_BYTES_SOFT_LIMIT
  );
}

function accessedAtMs(cache) {
  const raw = cache?.last_accessed_at ?? cache?.created_at ?? 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function newestFirst(left, right) {
  return accessedAtMs(right) - accessedAtMs(left);
}

function isLiveRef(ref, openRefs) {
  return openRefs.has(String(ref ?? ''));
}

function evictRecord(cache, reason) {
  return {
    id: cache.id,
    key: cache.key,
    ref: cache.ref,
    reason,
    size_in_bytes: cache.size_in_bytes ?? 0,
  };
}

export function buildOpenCacheRefs({
  mainRef = 'refs/heads/main',
  pullRequests = [],
} = {}) {
  const refs = new Set([mainRef]);
  for (const pull of pullRequests) {
    const number = Number(pull?.number);
    const branch = String(pull?.headRef ?? pull?.head?.ref ?? '').trim();
    if (Number.isInteger(number) && number > 0) {
      refs.add(`refs/pull/${number}/merge`);
      refs.add(`refs/pull/${number}/head`);
    }
    if (branch) refs.add(`refs/heads/${branch}`);
  }
  return refs;
}

export function planCacheGc({
  caches = [],
  openRefs = new Set(['refs/heads/main']),
  usage = {},
  nowMs = Date.now(),
} = {}) {
  const liveRefs = openRefs instanceof Set ? openRefs : new Set(openRefs);
  const overBudget = isOverCacheBudget(usage, caches.length);
  const turboKeep = overBudget
    ? TURBO_KEEP_OVER_BUDGET
    : TURBO_KEEP_UNDER_BUDGET;
  const evict = [];
  const live = [];

  for (const cache of caches) {
    if (isLiveRef(cache.ref, liveRefs)) {
      live.push(cache);
      continue;
    }
    evict.push(evictRecord(cache, 'closed_ref'));
  }

  const byExactKey = new Map();
  for (const cache of live) {
    const groupKey = `${cache.ref}\0${cache.key}`;
    const group = byExactKey.get(groupKey) ?? [];
    group.push(cache);
    byExactKey.set(groupKey, group);
  }
  const afterDupes = [];
  for (const group of byExactKey.values()) {
    const sorted = [...group].toSorted(newestFirst);
    afterDupes.push(sorted[0]);
    for (const extra of sorted.slice(1)) {
      evict.push(evictRecord(extra, 'exact_key_duplicate'));
    }
  }

  const turboGroups = new Map();
  const afterTurbo = [];
  for (const cache of afterDupes) {
    const family = turboFamily(cache.key);
    if (!family) {
      afterTurbo.push(cache);
      continue;
    }
    const groupKey = `${cache.ref}\0${family}`;
    const group = turboGroups.get(groupKey) ?? [];
    group.push(cache);
    turboGroups.set(groupKey, group);
  }
  for (const group of turboGroups.values()) {
    const sorted = [...group].toSorted(newestFirst);
    afterTurbo.push(...sorted.slice(0, turboKeep));
    for (const extra of sorted.slice(turboKeep)) {
      evict.push(evictRecord(extra, 'turbo_surplus'));
    }
  }

  const keep = [];
  for (const cache of afterTurbo) {
    const stale = nowMs - accessedAtMs(cache) > PROTECTED_MAX_AGE_MS;
    if (overBudget && isProtectedCacheKey(cache.key) && stale) {
      evict.push(evictRecord(cache, 'protected_stale_over_budget'));
      continue;
    }
    keep.push(cache);
  }

  return {
    evict,
    keep,
    overBudget,
    turboKeep,
    protectedRetained: keep.filter(cache => isProtectedCacheKey(cache.key))
      .length,
  };
}

export async function collectCacheGcSnapshot({ repository, execJson } = {}) {
  if (!repository) throw new Error('repository is required');
  if (typeof execJson !== 'function') {
    throw new Error('execJson is required');
  }
  const cachesRaw = await execJson([
    'api',
    '--paginate',
    `repos/${repository}/actions/caches`,
    '--jq',
    '[.actions_caches[]]',
  ]);
  const usage = await execJson([
    'api',
    `repos/${repository}/actions/cache/usage`,
  ]);
  const pulls = await execJson([
    'api',
    '--paginate',
    `repos/${repository}/pulls?state=open&per_page=100`,
    '--jq',
    '[.[] | {number, headRef: .head.ref}]',
  ]);
  return {
    caches: Array.isArray(cachesRaw) ? cachesRaw.flat() : [],
    usage: usage ?? {},
    openRefs: buildOpenCacheRefs({ pullRequests: pulls ?? [] }),
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  const apply = process.env.APPLY !== 'false';
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const snapshot = await collectCacheGcSnapshot({
    repository,
    execJson: async args => {
      const { stdout } = await execFileAsync('gh', args, {
        maxBuffer: 20 * 1024 * 1024,
        env: process.env,
      });
      return JSON.parse(stdout || 'null');
    },
  });
  const plan = planCacheGc({
    caches: snapshot.caches,
    openRefs: snapshot.openRefs,
    usage: snapshot.usage,
  });
  const deleted = [];
  if (apply) {
    for (const cache of plan.evict) {
      await execFileAsync(
        'gh',
        [
          'api',
          '-X',
          'DELETE',
          `repos/${repository}/actions/caches/${cache.id}`,
        ],
        { env: process.env }
      );
      deleted.push(cache.id);
    }
  }
  const summary = {
    apply,
    cacheCount: snapshot.caches.length,
    evictCount: plan.evict.length,
    keepCount: plan.keep.length,
    overBudget: plan.overBudget,
    turboKeep: plan.turboKeep,
    protectedRetained: plan.protectedRetained,
    reasons: plan.evict.reduce((counts, cache) => {
      counts[cache.reason] = (counts[cache.reason] ?? 0) + 1;
      return counts;
    }, {}),
    deleted,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
