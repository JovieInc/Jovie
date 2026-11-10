import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));

import {
  COMPANY_HISTORY_ALIASES_PER_REQUEST,
  MERGED_PR_SCOPES,
  pacificDayBounds,
} from './contract';
import {
  readCompanyHistory,
  readMergedPrSeries,
  type SearchCounts,
  syncCompanyHistory,
} from './store.server';

/** The subset of Upstash Redis the store uses, in memory. */
function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const calls = { hgetall: 0, hset: 0, hdel: 0 };
  const redis = {
    async hgetall<T>(key: string) {
      calls.hgetall += 1;
      const hash = hashes.get(key);
      return (hash ? Object.fromEntries(hash) : null) as T | null;
    },
    async hset(key: string, fields: Record<string, string>) {
      calls.hset += 1;
      const hash = hashes.get(key) ?? new Map<string, string>();
      for (const [field, value] of Object.entries(fields))
        hash.set(field, value);
      hashes.set(key, hash);
      return Object.keys(fields).length;
    },
    async hdel(key: string, ...fields: string[]) {
      calls.hdel += 1;
      for (const field of fields) hashes.get(key)?.delete(field);
      return fields.length;
    },
    async get<T>(key: string) {
      return (strings.get(key) ?? null) as T | null;
    },
    async set(key: string, value: string) {
      strings.set(key, value);
      return 'OK';
    },
  };
  return { redis: redis as never, hashes, calls };
}

/** Counts derived from the query text, so every day/scope has a known value. */
function countingSearch(): { search: SearchCounts; queries: string[][] } {
  const queries: string[][] = [];
  const search: SearchCounts = async input => {
    queries.push(Object.values(input));
    return {
      status: 'ok',
      counts: Object.fromEntries(
        Object.entries(input).map(([alias, query]) => [
          alias,
          query.startsWith('org:') ? 90 : query.includes('/Jovie ') ? 70 : 10,
        ])
      ),
    };
  };
  return { search, queries };
}

const NOW = new Date('2026-11-08T20:40:00Z');

describe('syncCompanyHistory', () => {
  it('backfills in at most two requests, then reads with zero provider calls', async () => {
    const { redis, calls } = fakeRedis();
    const { search, queries } = countingSearch();
    const receipt = await syncCompanyHistory(NOW, {
      redis,
      owner: 'JovieInc',
      searchCounts: search,
    });
    expect(receipt).toMatchObject({
      status: 'ok',
      requests: 2,
      written: COMPANY_HISTORY_ALIASES_PER_REQUEST * 2,
    });
    expect(queries.every(q => q.length <= 60)).toBe(true);
    expect(queries[0]![0]).toBe(
      'org:JovieInc is:pr is:merged merged:2026-11-08T08:00:00Z..2026-11-09T07:59:59Z'
    );

    const callsBeforeRead = queries.length;
    const history = await readCompanyHistory([7, 30], { now: NOW, redis });
    expect(queries.length).toBe(callsBeforeRead);
    expect(history?.cache).toEqual({ readPathUpstreamCalls: 0, modelCalls: 0 });
    expect(history?.windows['7']?.org).toMatchObject({
      total: 630,
      complete: true,
    });
    expect(history?.windows['7']?.Jovie.total).toBe(490);
    // 30 days at 4 scopes = 120 searches: exactly one backfill run.
    expect(history?.windows['30']?.org.total).toBe(2700);
    expect(history?.windows['30']?.org.priorTotal).toBeNull();
    expect(history?.lastSync?.status).toBe('ok');
    expect(calls.hgetall).toBeGreaterThan(0);
  });

  it('marks finished days final and stops fetching them', async () => {
    const { redis } = fakeRedis();
    const { search, queries } = countingSearch();
    const deps = { redis, owner: 'JovieInc', searchCounts: search };
    for (let i = 0; i < 5; i++) await syncCompanyHistory(NOW, deps);
    const series = await readMergedPrSeries(redis);
    expect(series.org['2026-11-08']?.final).toBe(false);
    expect(series.org['2026-11-06']?.final).toBe(true);
    // 480 searches: 120 on run 1, then 112 new per run (8 refresh today and yesterday).
    expect(Object.keys(series.org)).toHaveLength(120);

    queries.length = 0;
    const warm = await syncCompanyHistory(NOW, deps);
    // Today and yesterday only.
    expect(warm).toMatchObject({ requests: 1, written: 8 });
    expect(queries.flat()).toHaveLength(8);
  });

  it('keeps yesterday non-final until an hour after it ended', async () => {
    const { redis } = fakeRedis();
    const { search } = countingSearch();
    const deps = { redis, owner: 'JovieInc', searchCounts: search };
    const { endMs } = pacificDayBounds('2026-11-07');
    await syncCompanyHistory(new Date(endMs + 30 * 60_000), deps);
    expect((await readMergedPrSeries(redis)).org['2026-11-07']?.final).toBe(
      false
    );
    await syncCompanyHistory(new Date(endMs + 61 * 60_000), deps);
    expect((await readMergedPrSeries(redis)).org['2026-11-07']?.final).toBe(
      true
    );
  });

  it('records a failed provider read without writing guesses', async () => {
    const { redis, hashes } = fakeRedis();
    const receipt = await syncCompanyHistory(NOW, {
      redis,
      owner: 'JovieInc',
      searchCounts: async () => ({
        status: 'unavailable',
        reason: 'rate-limited',
      }),
    });
    expect(receipt).toMatchObject({
      status: 'unavailable',
      written: 0,
      requests: 1,
      reason: 'rate-limited',
    });
    expect([...hashes.values()].every(h => h.size === 0)).toBe(true);
    expect(await readCompanyHistory([7], { now: NOW, redis })).toBeNull();
  });

  it('fails closed without Redis or an owner', async () => {
    const { search, queries } = countingSearch();
    await expect(
      syncCompanyHistory(NOW, {
        redis: null,
        owner: 'JovieInc',
        searchCounts: search,
      })
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'redis-unavailable',
    });
    const { redis } = fakeRedis();
    await expect(
      syncCompanyHistory(NOW, { redis, owner: null, searchCounts: search })
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'github-owner-unconfigured',
    });
    expect(queries).toHaveLength(0);
    expect(await readCompanyHistory([7], { redis: null })).toBeNull();
  });

  it('trims days past retention', async () => {
    const { redis, hashes } = fakeRedis();
    for (const scope of MERGED_PR_SCOPES) {
      hashes.set(
        `summer:company-history:v1:merged_prs:${scope}`,
        new Map([
          [
            '2026-01-01',
            JSON.stringify({ c: 1, f: true, o: NOW.toISOString() }),
          ],
        ])
      );
    }
    const { search } = countingSearch();
    await syncCompanyHistory(NOW, {
      redis,
      owner: 'JovieInc',
      searchCounts: search,
    });
    expect(
      hashes.get('summer:company-history:v1:merged_prs:org')?.has('2026-01-01')
    ).toBe(false);
  });
});
