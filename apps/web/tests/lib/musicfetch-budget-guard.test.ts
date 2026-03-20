import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let nodeEnv = 'test';
let vercelEnv: string | undefined;
let dailyHardLimit: string | undefined;
let monthlyHardLimit: string | undefined;

vi.mock('@/lib/env-server', () => ({
  env: {
    get NODE_ENV() {
      return nodeEnv;
    },
    get VERCEL_ENV() {
      return vercelEnv;
    },
    get MUSICFETCH_DAILY_HARD_LIMIT() {
      return dailyHardLimit;
    },
    get MUSICFETCH_MONTHLY_HARD_LIMIT() {
      return monthlyHardLimit;
    },
  },
}));

const mockGetRedis = vi.fn();
vi.mock('@/lib/redis', () => ({
  getRedis: () => mockGetRedis(),
}));

class FakeRedis {
  private readonly counts = new Map<string, number>();
  private readonly ttl = new Map<string, number>();

  async eval(
    _script: string,
    keys: string[],
    args: [number, number, number, number]
  ): Promise<[number, string?]> {
    const [dailyKey, monthlyKey] = keys;
    const [dailyLimit, monthlyLimit, dailyTtl, monthlyTtl] = args;
    const dailyCount = this.counts.get(dailyKey) ?? 0;
    const monthlyCount = this.counts.get(monthlyKey) ?? 0;

    if (dailyCount >= dailyLimit) {
      return [0, 'daily'];
    }

    if (monthlyCount >= monthlyLimit) {
      return [0, 'monthly'];
    }

    const nextDaily = dailyCount + 1;
    const nextMonthly = monthlyCount + 1;
    this.counts.set(dailyKey, nextDaily);
    this.counts.set(monthlyKey, nextMonthly);
    if (nextDaily === 1) this.ttl.set(dailyKey, dailyTtl);
    if (nextMonthly === 1) this.ttl.set(monthlyKey, monthlyTtl);

    return [1];
  }

  getCount(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  getTtl(key: string): number | undefined {
    return this.ttl.get(key);
  }
}

describe('musicfetch budget guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    nodeEnv = 'test';
    vercelEnv = undefined;
    dailyHardLimit = '1500';
    monthlyHardLimit = '45000';
  });

  it('allows requests up to the configured daily limit', async () => {
    const redis = new FakeRedis();
    mockGetRedis.mockReturnValue(redis);
    const now = new Date('2026-03-19T12:00:00.000Z');

    const { reserveMusicfetchBudget } = await import(
      '@/lib/musicfetch/budget-guard'
    );

    for (let i = 0; i < 1500; i += 1) {
      await expect(reserveMusicfetchBudget(now)).resolves.toBeUndefined();
    }

    await expect(reserveMusicfetchBudget(now)).rejects.toMatchObject({
      name: 'MusicfetchBudgetExceededError',
      budgetScope: 'daily',
      retryAfterSeconds: 43_200,
    });

    expect(redis.getCount('musicfetch:budget:day:2026-03-19')).toBe(1500);
    expect(redis.getTtl('musicfetch:budget:day:2026-03-19')).toBe(43_200);
  });

  it('blocks when the monthly limit is exhausted', async () => {
    const redis = new FakeRedis();
    mockGetRedis.mockReturnValue(redis);
    dailyHardLimit = '60000';
    monthlyHardLimit = '2';
    const now = new Date('2026-03-19T12:00:00.000Z');

    const { reserveMusicfetchBudget } = await import(
      '@/lib/musicfetch/budget-guard'
    );

    await reserveMusicfetchBudget(now);
    await reserveMusicfetchBudget(now);

    await expect(reserveMusicfetchBudget(now)).rejects.toMatchObject({
      name: 'MusicfetchBudgetExceededError',
      budgetScope: 'monthly',
    });

    expect(redis.getCount('musicfetch:budget:month:2026-03')).toBe(2);
  });

  it('fails closed in production when Redis is unavailable', async () => {
    nodeEnv = 'production';
    vercelEnv = 'production';
    mockGetRedis.mockReturnValue(null);

    const { reserveMusicfetchBudget } = await import(
      '@/lib/musicfetch/budget-guard'
    );

    await expect(
      reserveMusicfetchBudget(new Date('2026-03-19T12:00:00.000Z'))
    ).rejects.toMatchObject({
      name: 'MusicfetchBudgetExceededError',
      budgetScope: 'backend_unavailable',
      statusCode: 429,
    });
  });

  it('no-ops in test when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);

    const { reserveMusicfetchBudget } = await import(
      '@/lib/musicfetch/budget-guard'
    );

    await expect(
      reserveMusicfetchBudget(new Date('2026-03-19T12:00:00.000Z'))
    ).resolves.toBeUndefined();
  });
});
