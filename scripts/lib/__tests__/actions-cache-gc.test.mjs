import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOpenCacheRefs,
  CACHE_BYTES_SOFT_LIMIT,
  CACHE_COUNT_SOFT_LIMIT,
  isProtectedCacheKey,
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
