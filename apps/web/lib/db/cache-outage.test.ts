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

  it('bounds a stalled GET and never trusts its late result or later local recovery', async () => {
    vi.useFakeTimers();
    const redis = fakeRedis();
    const gate = deferred<unknown>();
    redis.get.mockImplementationOnce(() => gate.promise);
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery, getCacheStats } = await import('@/lib/db/cache');
    const origin = vi.fn(async () => 'fresh');
    const read = cacheQuery('tenant-a:analytics', origin);
    await flush();
    await vi.advanceTimersByTimeAsync(749);
    expect(origin).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(origin).toHaveBeenCalledTimes(1);
    expect(await read).toBe('fresh');
    gate.resolve({ __sentinel: true, value: 'old' });
    await flush();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(
      await cacheQuery('tenant-a:analytics', origin, { skipMemoryCache: true })
    ).toBe('fresh');
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
    expect(getCacheStats().redisAvailable).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases invalidation after a stalled SET and never trusts a late old SET', async () => {
    vi.useFakeTimers();
    const redis = fakeRedis();
    const gate = deferred();
    redis.set.mockImplementationOnce(async (key, value) => {
      await gate.promise;
      redis.values.set(key, value);
      return 'OK';
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery, invalidateCache, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    expect(await cacheQuery('tenant-a:analytics', async () => 'old')).toBe(
      'old'
    );
    let done = false;
    const invalidation = invalidateCache('tenant-a:analytics').then(() => {
      done = true;
    });
    const fresh = cacheQuery('tenant-a:analytics', async () => 'fresh');
    await flush();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(750);
    expect(done).toBe(true);
    await invalidation;
    expect(await fresh).toBe('fresh');
    expect(getCacheStats().inFlightLoads.size).toBe(0);
    gate.resolve();
    await flush();
    expect(redis.values.get('db:cache:v2:tenant-a:analytics')).toEqual({
      __sentinel: true,
      value: 'old',
    });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(
      await cacheQuery(
        'tenant-a:analytics',
        async () => 'fresh-after-recovery',
        { skipMemoryCache: true }
      )
    ).toBe('fresh-after-recovery');
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(getCacheStats().redisAvailable).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards another key GET that completes after quarantine started', async () => {
    vi.useFakeTimers();
    const redis = fakeRedis();
    const setGate = deferred();
    const getGate = deferred<unknown>();
    redis.set.mockImplementationOnce(async () => {
      await setGate.promise;
      return 'OK';
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery } = await import('@/lib/db/cache');
    await cacheQuery('tenant-a:analytics', async () => 'a');
    await vi.advanceTimersByTimeAsync(700);
    redis.get.mockImplementationOnce(() => getGate.promise);
    const b = cacheQuery('tenant-b:analytics', async () => 'fresh-b');
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    getGate.resolve({ __sentinel: true, value: 'old-b' });
    expect(await b).toBe('fresh-b');
    expect(
      await cacheQuery('tenant-b:analytics', async () => 'unexpected')
    ).toBe('fresh-b');
    setGate.resolve();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['DEL', 'SCAN', 'pipeline'] as const)(
    'bounds stalled %s invalidation and quarantines further Redis cache work',
    async command => {
      vi.useFakeTimers();
      const redis = fakeRedis();
      const gate = deferred<never>();
      hoisted.getRedis.mockReturnValue(redis);
      const {
        cacheQuery,
        invalidateCache,
        invalidateCacheByPrefix,
        getCacheStats,
      } = await import('@/lib/db/cache');
      await cacheQuery('tenant-a:analytics', async () => 'old');
      await flush();
      if (command === 'DEL')
        redis.del.mockImplementationOnce(() => gate.promise);
      if (command === 'SCAN')
        redis.scan.mockImplementationOnce(() => gate.promise);
      if (command === 'pipeline')
        redis.pipeline = () => ({ del() {}, exec: () => gate.promise });
      let done = false;
      const invalidation = (
        command === 'DEL'
          ? invalidateCache('tenant-a:analytics')
          : invalidateCacheByPrefix('tenant-a:')
      ).then(() => {
        done = true;
      });
      await flush();
      await vi.advanceTimersByTimeAsync(749);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
      await invalidation;
      expect(getCacheStats().redisAvailable).toBe(false);
      const gets = redis.get.mock.calls.length;
      expect(
        await cacheQuery('tenant-a:analytics', async () => 'fresh', {
          skipMemoryCache: true,
        })
      ).toBe('fresh');
      expect(redis.get).toHaveBeenCalledTimes(gets);
      gate.reject(new Error('late transport failure'));
      await flush();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('bounds the whole scan and pipeline sequence by one invalidation deadline', async () => {
    vi.useFakeTimers();
    const redis = fakeRedis();
    const pipelineGate = deferred<unknown[]>();
    redis.scan.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          setTimeout(
            () => resolve([0, ['db:cache:v2:tenant-a:analytics']]),
            400
          );
        })
    );
    redis.pipeline = () => ({ del() {}, exec: () => pipelineGate.promise });
    hoisted.getRedis.mockReturnValue(redis);
    const { invalidateCacheByPrefix, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    let done = false;
    const invalidation = invalidateCacheByPrefix('tenant-a:').then(() => {
      done = true;
    });
    await flush();
    await vi.advanceTimersByTimeAsync(749);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    await invalidation;
    expect(getCacheStats().redisAvailable).toBe(false);
    pipelineGate.resolve([]);
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps a fast SCAN cursor that never terminates', async () => {
    const redis = fakeRedis();
    // A finite fixture safety stop keeps deliberate-red runs responsive when
    // the implementation has no page bound. The candidate must stop sooner.
    redis.scan.mockImplementation(async () => {
      if (redis.scan.mock.calls.length > 60)
        throw new Error('fixture safety stop');
      return [1, []];
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { invalidateCacheByPrefix, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    await invalidateCacheByPrefix('tenant-a:');
    expect(redis.scan.mock.calls.length).toBeLessThanOrEqual(50);
    expect(getCacheStats().redisAvailable).toBe(false);
  });

  it('caps prefix key collection and quarantines an incomplete invalidation', async () => {
    const redis = fakeRedis();
    redis.scan.mockResolvedValue([
      0,
      Array.from({ length: 5001 }, (_, i) => `db:cache:v2:tenant-a:${i}`),
    ]);
    hoisted.getRedis.mockReturnValue(redis);
    const { invalidateCacheByPrefix, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    await invalidateCacheByPrefix('tenant-a:');
    expect(redis.scan).toHaveBeenCalledTimes(1);
    expect(getCacheStats().redisAvailable).toBe(false);
  });

  it('quarantines a partially failed pipeline invalidation', async () => {
    const redis = fakeRedis();
    redis.scan.mockResolvedValue([0, ['db:cache:v2:tenant-a:analytics']]);
    redis.pipeline = () => ({
      del() {},
      exec: async () => [new Error('delete failed')],
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { invalidateCacheByPrefix, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    await invalidateCacheByPrefix('tenant-a:');
    expect(getCacheStats().redisAvailable).toBe(false);
  });

  it('does not restore trust after invalidation had no Redis backend', async () => {
    const { cacheQuery, invalidateCache, getCacheStats } = await import(
      '@/lib/db/cache'
    );
    await invalidateCache('tenant-a:analytics');
    const redis = fakeRedis();
    redis.values.set('db:cache:v2:tenant-a:analytics', {
      __sentinel: true,
      value: 'old',
    });
    hoisted.getRedis.mockReturnValue(redis);
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    expect(redis.get).not.toHaveBeenCalled();
    expect(getCacheStats().redisAvailable).toBe(false);
  });

  it('detaches a never-settling origin flight after a finite retention period without replaying it', async () => {
    vi.useFakeTimers();
    const { cacheQuery, getCacheStats } = await import('@/lib/db/cache');
    const gate = deferred<string>();
    const origin = vi.fn(() => gate.promise);
    const old = cacheQuery('tenant-a:analytics', origin);
    await flush();
    expect(getCacheStats().inFlightLoads.size).toBe(1);
    await vi.advanceTimersByTimeAsync(getCacheStats().inFlightLoads.maxAgeMs);
    expect(getCacheStats().inFlightLoads.size).toBe(0);
    expect(origin).toHaveBeenCalledTimes(1);
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    gate.resolve('old');
    expect(await old).toBe('old');
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected')
    ).toBe('fresh');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps retained distinct flights and releases all metadata after expiration', async () => {
    vi.useFakeTimers();
    const { cacheQuery, getCacheStats } = await import('@/lib/db/cache');
    const gate = deferred<string>();
    const max = getCacheStats().inFlightLoads.maxSize;
    const reads = Array.from({ length: max }, (_, i) =>
      cacheQuery(`tenant-${i}:analytics`, () => gate.promise)
    );
    await flush();
    const overflow = vi.fn(() => gate.promise);
    reads.push(
      cacheQuery('tenant-overflow:analytics', overflow),
      cacheQuery('tenant-overflow:analytics', overflow)
    );
    await flush();
    expect(getCacheStats().inFlightLoads.size).toBe(max);
    expect(overflow).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(getCacheStats().inFlightLoads.maxAgeMs);
    expect(getCacheStats().inFlightLoads.size).toBe(0);
    gate.resolve('old');
    await Promise.all(reads);
    expect(await cacheQuery('tenant-0:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
