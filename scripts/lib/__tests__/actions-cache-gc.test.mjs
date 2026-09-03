import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOpenCacheRefs,
  CACHE_BYTES_SOFT_LIMIT,
  CACHE_COUNT_SOFT_LIMIT,
  collectCacheGcSnapshot,
  flattenGhPages,
  isProtectedCacheKey,
  parseGhJsonOutput,
  planCacheGc,
  turboFamily,
} from '../actions-cache-gc.mjs';

const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/actions-cache-gc.yml'
  ),
  'utf8'
);

const now = Date.parse('2026-08-22T12:00:00Z');

function cache(overrides = {}) {
  return {
    id: 1,
    key: 'Linux-turbo-aaa',
    ref: 'refs/heads/stale-branch',
    last_accessed_at: '2026-08-21T12:00:00Z',
    size_in_bytes: 100,
    ...overrides,
  };
}

describe('Actions cache GC', () => {
  it('evicts closed-ref and exact-key duplicate turbo caches', () => {
    const plan = planCacheGc({
      nowMs: now,
      openRefs: buildOpenCacheRefs({
        pullRequests: [{ number: 17, headRef: 'cursor/fx' }],
      }),
      usage: { active_caches_count: 10, active_caches_size_in_bytes: 1000 },
      caches: [
        cache({ id: 1, ref: 'refs/heads/closed-pr', key: 'Linux-turbo-old' }),
        cache({
          id: 2,
          ref: 'refs/heads/cursor/fx',
          key: 'Linux-turbo-aaa',
          last_accessed_at: '2026-08-22T10:00:00Z',
        }),
        cache({
          id: 3,
          ref: 'refs/heads/cursor/fx',
          key: 'Linux-turbo-aaa',
          last_accessed_at: '2026-08-20T10:00:00Z',
        }),
        cache({
          id: 4,
          ref: 'refs/heads/main',
          key: 'Linux-playwright-chromium-v1',
        }),
      ],
    });
    expect(plan.evict.map(item => item.reason).sort()).toEqual([
      'closed_ref',
      'exact_key_duplicate',
    ]);
    expect(plan.evict.map(item => item.id).sort()).toEqual([1, 3]);
    expect(plan.keep.map(item => item.id).sort()).toEqual([2, 4]);
    expect(isProtectedCacheKey('Linux-playwright-chromium-v1')).toBe(true);
    expect(isProtectedCacheKey('macOS-swiftpm-xcode-abc')).toBe(true);
    expect(isProtectedCacheKey('Linux-pip-pytest-abc')).toBe(true);
    expect(isProtectedCacheKey('macOS-electron-downloads-abc')).toBe(true);
    expect(turboFamily('Linux-turbo-aaa')).toBe('Linux-turbo');
  });

  it('keeps only the newest turbo family per live ref when over budget', () => {
    const plan = planCacheGc({
      nowMs: now,
      openRefs: new Set(['refs/heads/main']),
      usage: {
        active_caches_count: CACHE_COUNT_SOFT_LIMIT + 1,
        active_caches_size_in_bytes: CACHE_BYTES_SOFT_LIMIT + 1,
      },
      caches: [
        cache({
          id: 1,
          ref: 'refs/heads/main',
          key: 'Linux-turbo-one',
          last_accessed_at: '2026-08-22T11:00:00Z',
        }),
        cache({
          id: 2,
          ref: 'refs/heads/main',
          key: 'Linux-turbo-two',
          last_accessed_at: '2026-08-20T11:00:00Z',
        }),
        cache({
          id: 3,
          ref: 'refs/heads/main',
          key: 'Linux-pnpm-9',
          last_accessed_at: '2026-07-01T11:00:00Z',
        }),
        cache({
          id: 4,
          ref: 'refs/heads/main',
          key: 'Linux-playwright-chromium-v1',
          last_accessed_at: '2026-08-22T11:00:00Z',
        }),
      ],
    });
    expect(plan.overBudget).toBe(true);
    expect(plan.turboKeep).toBe(1);
    expect(plan.evict.map(item => item.id).sort()).toEqual([2, 3]);
    expect(plan.keep.map(item => item.id).sort()).toEqual([1, 4]);
    expect(plan.evict.find(item => item.id === 3)?.reason).toBe(
      'protected_stale_over_budget'
    );
  });

  it('does not smash a recently used live playwright cache under budget', () => {
    const plan = planCacheGc({
      nowMs: now,
      openRefs: new Set(['refs/heads/main']),
      usage: { active_caches_count: 10, active_caches_size_in_bytes: 100 },
      caches: [
        cache({
          id: 9,
          ref: 'refs/heads/main',
          key: 'Linux-playwright-chromium-v1',
          last_accessed_at: '2026-08-22T11:00:00Z',
        }),
      ],
    });
    expect(plan.evict).toEqual([]);
    expect(plan.keep.map(item => item.id)).toEqual([9]);
  });

  it('trims recent live caches by LRU until the byte budget is restored', () => {
    const fiveGiB = 5 * 1024 * 1024 * 1024;
    const plan = planCacheGc({
      nowMs: now,
      openRefs: new Set(['refs/heads/main']),
      usage: {
        active_caches_count: 2,
        active_caches_size_in_bytes: fiveGiB * 2,
      },
      caches: [
        cache({
          id: 10,
          ref: 'refs/heads/main',
          key: 'macOS-swiftpm-old',
          size_in_bytes: fiveGiB,
          last_accessed_at: '2026-08-21T11:00:00Z',
        }),
        cache({
          id: 11,
          ref: 'refs/heads/main',
          key: 'macOS-swiftpm-new',
          size_in_bytes: fiveGiB,
          last_accessed_at: '2026-08-22T11:00:00Z',
        }),
      ],
    });

    expect(plan.evict.map(item => item.id)).toEqual([10]);
    expect(plan.evict[0]?.reason).toBe('budget_lru');
    expect(plan.keep.map(item => item.id)).toEqual([11]);
    expect(plan.keepBytes).toBe(fiveGiB);
  });

  it('parses paginated gh --slurp pages instead of crashing on 459 caches', async () => {
    const pageOne = {
      total_count: 459,
      actions_caches: [cache({ id: 1, key: 'Linux-turbo-one' })],
    };
    const pageTwo = {
      total_count: 459,
      actions_caches: [cache({ id: 2, key: 'Linux-turbo-two' })],
    };
    expect(
      flattenGhPages(
        parseGhJsonOutput(JSON.stringify([pageOne, pageTwo])),
        'actions_caches'
      ).map(item => item.id)
    ).toEqual([1, 2]);
    expect(
      flattenGhPages(
        parseGhJsonOutput(
          `${JSON.stringify(pageOne)}\n${JSON.stringify(pageTwo)}`
        ),
        'actions_caches'
      ).map(item => item.id)
    ).toEqual([1, 2]);
    const snapshot = await collectCacheGcSnapshot({
      repository: 'JovieInc/Jovie',
      execJson: async args => {
        const joined = args.join(' ');
        if (joined.includes('/actions/caches')) {
          expect(args.includes('--paginate')).toBe(true);
          expect(args.includes('--slurp')).toBe(true);
          return [pageOne, pageTwo];
        }
        if (joined.includes('/actions/cache/usage')) {
          return { active_caches_count: 459, active_caches_size_in_bytes: 10 };
        }
        expect(joined.includes('/pulls?')).toBe(true);
        expect(args.includes('--paginate')).toBe(true);
        expect(args.includes('--slurp')).toBe(true);
        return [[{ number: 17, head: { ref: 'cursor/fx' } }]];
      },
    });
    expect(snapshot.caches.map(item => item.id)).toEqual([1, 2]);
    expect(snapshot.openRefs.has('refs/heads/cursor/fx')).toBe(true);
    expect(snapshot.openRefs.has('refs/pull/17/merge')).toBe(true);
  });

  it('schedules automatic GC with actions: write and no human smash', () => {
    for (const token of [
      'name: Actions Cache GC',
      "cron: '19 4 * * *'",
      'workflow_dispatch:',
      'actions: write',
      'node scripts/lib/actions-cache-gc.mjs',
      "APPLY: ${{ github.event.inputs.apply || 'true' }}",
    ]) {
      expect(WORKFLOW, token).toContain(token);
    }
    expect(WORKFLOW).not.toContain('contents: write');
    expect(WORKFLOW).not.toContain('JOVIE_BOT_PRIVATE_KEY');
  });
});
