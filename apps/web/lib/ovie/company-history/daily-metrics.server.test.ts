import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));

import {
  type DailyMetricSource,
  readCompanyMetrics,
  syncCompanyMetrics,
} from './daily-metrics.server';

function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const redis = {
    async hgetall<T>(key: string) {
      const hash = hashes.get(key);
      return (hash ? Object.fromEntries(hash) : null) as T | null;
    },
    async hset(key: string, fields: Record<string, string>) {
      const hash = hashes.get(key) ?? new Map<string, string>();
      for (const [f, v] of Object.entries(fields)) hash.set(f, v);
      hashes.set(key, hash);
      return Object.keys(fields).length;
    },
    async hdel(key: string, ...fields: string[]) {
      for (const f of fields) hashes.get(key)?.delete(f);
      return fields.length;
    },
  };
  return { redis: redis as never, hashes };
}

const NOW = new Date('2026-11-08T20:40:00Z');

function counting(metric: DailyMetricSource['metric'], value = 3) {
  const asked: string[][] = [];
  const source: DailyMetricSource = {
    metric,
    budget: 30,
    async read(dates) {
      asked.push([...dates]);
      return {
        status: 'ok',
        values: Object.fromEntries(dates.map(d => [d, value])),
      };
    },
  };
  return { source, asked };
}

describe('syncCompanyMetrics', () => {
  it('fills, then reads with zero source calls', async () => {
    const { redis } = fakeRedis();
    const signups = counting('signups', 2);
    const receipts = await syncCompanyMetrics(NOW, {
      redis,
      sources: [signups.source],
    });
    expect(receipts.signups).toMatchObject({
      status: 'ok',
      requested: 30,
      written: 30,
    });
    const before = signups.asked.length;
    const read = await readCompanyMetrics(['signups', 'ai_spend'], [7, 30], {
      now: NOW,
      redis,
    });
    expect(signups.asked.length).toBe(before);
    expect(read?.cache).toEqual({ readPathUpstreamCalls: 0, modelCalls: 0 });
    expect(read?.metrics.signups?.windows['7']).toMatchObject({
      total: 14,
      complete: true,
    });
    expect(read?.metrics.signups?.lastSync?.status).toBe('ok');
    // No cached day for spend: absent, not zero.
    expect(read?.metrics.ai_spend).toBeUndefined();
  });

  it('keeps one failing source from blocking the others', async () => {
    const { redis } = fakeRedis();
    const chats = counting('onboarding_chats');
    const receipts = await syncCompanyMetrics(NOW, {
      redis,
      sources: [
        {
          metric: 'ai_spend',
          budget: 5,
          read: async () => {
            throw new Error('gateway 500');
          },
        },
        chats.source,
      ],
    });
    expect(receipts.ai_spend).toMatchObject({
      status: 'unavailable',
      written: 0,
      reason: 'gateway 500',
    });
    expect(receipts.onboarding_chats?.status).toBe('ok');
  });

  it('marks a day a source could not count as partial and leaves it missing', async () => {
    const { redis } = fakeRedis();
    const receipts = await syncCompanyMetrics(NOW, {
      redis,
      sources: [
        {
          metric: 'ci_failed_runs',
          budget: 3,
          read: async dates => ({
            status: 'ok',
            values: { [dates[0]!]: 4, [dates[1]!]: -1 },
          }),
        },
      ],
    });
    expect(receipts.ci_failed_runs).toMatchObject({
      status: 'partial',
      written: 1,
    });
    const read = await readCompanyMetrics(['ci_failed_runs'], [7], {
      now: NOW,
      redis,
    });
    expect(read?.metrics.ci_failed_runs?.windows['7']?.total).toBeNull();
  });

  it('fails closed without Redis', async () => {
    const chats = counting('onboarding_chats');
    const receipts = await syncCompanyMetrics(NOW, {
      redis: null,
      sources: [chats.source],
    });
    expect(receipts.onboarding_chats?.reason).toBe('redis-unavailable');
    expect(chats.asked).toHaveLength(0);
    expect(
      await readCompanyMetrics(['signups'], [7], { redis: null })
    ).toBeNull();
  });
});
