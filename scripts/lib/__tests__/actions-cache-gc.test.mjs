import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyCacheKey,
  isProtectedCacheKey,
  isTurboCacheKey,
  planActionsCacheGc,
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

function cache(overrides) {
  return {
    id: 1,
    key: 'Linux-turbo-aaa',
    ref: 'refs/heads/main',
    created_at: '2026-08-01T00:00:00Z',
    last_accessed_at: '2026-08-20T00:00:00Z',
    size_in_bytes: 100,
    ...overrides,
  };
}

describe('Actions cache GC planner', () => {
  it('classifies turbo vs protected pnpm/node/playwright keys', () => {
    expect(isTurboCacheKey('Linux-turbo-abc')).toBe(true);
    expect(classifyCacheKey('Linux-turbo-abc')).toBe('turbo');
    expect(isProtectedCacheKey('node-cache-Linux-pnpm-lock')).toBe(true);
    expect(isProtectedCacheKey('Linux-playwright-chromium-hash')).toBe(true);
    expect(isTurboCacheKey('Linux-playwright-chromium-hash')).toBe(false);
    expect(isTurboCacheKey('node-cache-Linux-pnpm-lock')).toBe(false);
  });

  it('evicts duplicate and stale turbo keys without touching protected caches', () => {
    const plan = planActionsCacheGc({
      caches: [
        cache({
          id: 11,
          key: 'Linux-turbo-current',
          last_accessed_at: '2026-08-22T00:00:00Z',
        }),
        cache({
          id: 12,
          key: 'Linux-turbo-current',
          last_accessed_at: '2026-08-10T00:00:00Z',
        }),
        cache({
          id: 21,
          key: 'Linux-turbo-previous',
          last_accessed_at: '2026-08-21T00:00:00Z',
        }),
        cache({
          id: 31,
          key: 'Linux-turbo-stale',
          last_accessed_at: '2026-07-01T00:00:00Z',
        }),
        cache({
          id: 41,
          key: 'node-cache-Linux-pnpm-lockhash',
          last_accessed_at: '2026-07-01T00:00:00Z',
        }),
        cache({
          id: 42,
          key: 'Linux-playwright-chromium-lockhash',
          last_accessed_at: '2026-07-01T00:00:00Z',
        }),
      ],
    });
    expect(plan.protected).toBe(2);
    expect(plan.deleteCount).toBe(2);
    expect(plan.deletions.map(entry => entry.id).sort((a, b) => a - b)).toEqual(
      [12, 31]
    );
    expect(plan.keptUniqueTurboKeys).toEqual([
      'Linux-turbo-current',
      'Linux-turbo-previous',
    ]);
    expect(
      plan.deletions.some(entry =>
        /pnpm|playwright|node-cache/i.test(entry.key)
      )
    ).toBe(false);
  });
});

describe('Actions Cache GC workflow contract', () => {
  it('schedules automatic GC with a dry-run dispatch path', () => {
    expect(WORKFLOW).toContain('name: Actions Cache GC');
    expect(WORKFLOW).toContain("cron: '53 4 * * *'");
    expect(WORKFLOW).toContain('node scripts/actions-cache-gc.mjs');
    expect(WORKFLOW).toContain('actions: write');
    expect(WORKFLOW).toContain('ref: ${{ github.sha }}');
    expect(WORKFLOW).not.toContain('contents: write');
    expect(WORKFLOW).not.toContain('JOVIE_BOT_PRIVATE_KEY');
  });
});
