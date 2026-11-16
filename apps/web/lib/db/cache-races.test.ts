import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ getRedis: vi.fn() }));
vi.mock('@/lib/redis', () => ({ getRedis: hoisted.getRedis }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function fakeRedis() {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(
      async (key: string): Promise<unknown> => values.get(key) ?? null
    ),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => values.delete(key)),
    scan: vi.fn(async () => [0, [...values.keys()]]),
    pipeline() {
      const keys: string[] = [];
      return {
        del(key: string) {
          keys.push(key);
        },
        async exec(): Promise<unknown[]> {
          return keys.map(key => values.delete(key));
        },
      };
    },
  };
}

describe('cacheQuery concurrent miss and invalidation contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getRedis.mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('treats an incomplete pipeline acknowledgment as uncertain invalidation', async () => {
    const redis = fakeRedis();
    redis.scan.mockResolvedValue([0, ['db:cache:v2:tenant-a:analytics']]);
    redis.pipeline = () => ({ del() {}, exec: async () => [] });
    hoisted.getRedis.mockReturnValue(redis);
    const { invalidateCacheByPrefix, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    await invalidateCacheByPrefix('tenant-a:');
    expect(getCacheStats().redisAvailable).toBe(false);
  });

  it('does not hide a pending SET when origin completion approaches flight expiry', async () => {
    vi.useFakeTimers();
    const redis = fakeRedis();
    const originGate = deferred<string>();
    const setGate = deferred();
    redis.set.mockImplementationOnce(async (key, value) => {
      await setGate.promise;
      redis.values.set(key, value);
      return 'OK';
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery, invalidateCache, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    const old = cacheQuery('tenant-a:analytics', () => originGate.promise);
    await flush();
    await vi.advanceTimersByTimeAsync(29_900);
    originGate.resolve('old');
    expect(await old).toBe('old');
    await vi.advanceTimersByTimeAsync(100);
    expect(getCacheStats().inFlightLoads.size).toBe(0);
    expect(getCacheStats().redisAvailable).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await invalidateCache('tenant-a:analytics');
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    await vi.advanceTimersByTimeAsync(400);
    setGate.resolve();
    await flush();
    expect(redis.values.get('db:cache:v2:tenant-a:analytics')).toEqual({
      __sentinel: true,
      value: 'old',
    });
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'fresh-again', {
        skipMemoryCache: true,
      })
    ).toBe('fresh-again');
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechecks quarantine when adopting a Redis value at the cache boundary', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue({ __sentinel: true, value: 'old' });
    hoisted.getRedis.mockReturnValue(redis);
    const transport = await import('@/lib/db/cache-redis');
    const read = transport.tryReadFromRedis;
    vi.spyOn(transport, 'tryReadFromRedis').mockImplementation(async key => {
      const result = await read(key);
      transport.quarantineRedisCache(
        new Error('concurrent invalidation failed')
      );
      return result;
    });
    const { cacheQuery } = await import('@/lib/db/cache');
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected')
    ).toBe('fresh');
  });

  it('rejects a result after the absolute deadline even when the timer is delayed', async () => {
    vi.useFakeTimers();
    const { withinCacheBudget } = await import('@/lib/db/cache-redis');
    const deadline = performance.now() + 750;
    await expect(
      withinCacheBudget(async () => {
        vi.spyOn(performance, 'now').mockReturnValue(deadline + 1);
        return 'late';
      }, deadline)
    ).rejects.toThrow('deadline exceeded');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares an AbortError once without retrying and allows a later independent read', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<string>();
    const origin = vi.fn(() => gate.promise);
    const reads = Array.from({ length: 10 }, () =>
      cacheQuery('tenant-a:analytics', origin)
    );
    const results = Promise.allSettled(reads);
    await flush();
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    gate.reject(abort);
    expect(
      (await results).every(
        result => result.status === 'rejected' && result.reason === abort
      )
    ).toBe(true);
    expect(origin).toHaveBeenCalledTimes(1);
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'recovered')
    ).toBe('recovered');
  });
});
