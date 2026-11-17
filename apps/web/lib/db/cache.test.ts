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

  it('coalesces 100 concurrent cold reads into one origin operation', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<number>();
    const origin = vi.fn(() => gate.promise);
    const reads = Array.from({ length: 100 }, () =>
      cacheQuery('tenant-a:analytics', origin)
    );
    await flush();
    gate.resolve(17);
    expect(await Promise.all(reads)).toEqual(Array(100).fill(17));
    expect(origin).toHaveBeenCalledTimes(1);
  });

  it('coalesces one Redis lookup and write for a cold burst', async () => {
    const redis = fakeRedis();
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<number>();
    const origin = vi.fn(() => gate.promise);
    const reads = Array.from({ length: 100 }, () =>
      cacheQuery('tenant-a:analytics', origin)
    );
    await flush();
    gate.resolve(17);
    await Promise.all(reads);
    await flush();
    expect(origin).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('keeps tenants isolated', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred();
    const a = cacheQuery('tenant-a:analytics', async () => {
      await gate.promise;
      return 'a';
    });
    const b = cacheQuery('tenant-b:analytics', async () => {
      await gate.promise;
      return 'b';
    });
    gate.resolve();
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
  });

  it('does not share pending reads with different cache options', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<number>();
    const origin = vi.fn(() => gate.promise);
    const reads = [
      cacheQuery('tenant-a:analytics', origin),
      cacheQuery('tenant-a:analytics', origin, { ttlSeconds: 120 }),
      cacheQuery('tenant-a:analytics', origin, { useRedis: false }),
      cacheQuery('tenant-a:analytics', origin, { skipMemoryCache: true }),
    ];
    await flush();
    gate.resolve(17);
    await Promise.all(reads);
    expect(origin).toHaveBeenCalledTimes(4);
  });

  it('preserves an explicit bypass of both cache layers', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<number>();
    const origin = vi.fn(() => gate.promise);
    const options = { useRedis: false, skipMemoryCache: true };
    const reads = [
      cacheQuery('bypass', origin, options),
      cacheQuery('bypass', origin, options),
    ];
    gate.resolve(1);
    await Promise.all(reads);
    expect(origin).toHaveBeenCalledTimes(2);
  });

  it('cleans up a rejected flight so a later request can recover', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const gate = deferred<number>();
    const origin = vi.fn(() => gate.promise);
    const reads = Array.from({ length: 10 }, () =>
      cacheQuery('failure', origin)
    );
    const settled = Promise.allSettled(reads);
    await flush();
    gate.reject(new Error('origin-down'));
    expect((await settled).every(item => item.status === 'rejected')).toBe(
      true
    );
    expect(await cacheQuery('failure', async () => 9)).toBe(9);
    expect(origin).toHaveBeenCalledTimes(1);
  });

  it('preserves cached null results', async () => {
    const { cacheQuery } = await import('@/lib/db/cache');
    const origin = vi.fn(async () => null);
    expect(await cacheQuery('missing', origin)).toBeNull();
    expect(await cacheQuery('missing', origin)).toBeNull();
    expect(origin).toHaveBeenCalledTimes(1);
  });

  it('does not let an invalidated origin read repopulate memory', async () => {
    const { cacheQuery, invalidateCache } = await import('@/lib/db/cache');
    const gate = deferred<string>();
    const old = cacheQuery('tenant-a:analytics', () => gate.promise);
    await flush();
    await invalidateCache('tenant-a:analytics');
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    gate.resolve('old');
    expect(await old).toBe('old');
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected')
    ).toBe('fresh');
  });

  it('does not let an invalidated Redis GET repopulate memory', async () => {
    const redis = fakeRedis();
    const gate = deferred<unknown>();
    redis.get.mockImplementationOnce(() => gate.promise);
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery, invalidateCache } = await import('@/lib/db/cache');
    const old = cacheQuery('tenant-a:analytics', async () => 'unexpected');
    await flush();
    await invalidateCache('tenant-a:analytics');
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    gate.resolve({ __sentinel: true, value: 'old' });
    expect(await old).toBe('old');
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected')
    ).toBe('fresh');
  });

  it('drains an already-issued Redis SET before invalidation completes', async () => {
    const redis = fakeRedis();
    const gate = deferred();
    redis.set.mockImplementationOnce(async (key, value) => {
      await gate.promise;
      redis.values.set(key, value);
      return 'OK';
    });
    hoisted.getRedis.mockReturnValue(redis);
    const { cacheQuery, invalidateCache } = await import('@/lib/db/cache');
    expect(await cacheQuery('tenant-a:analytics', async () => 'old')).toBe(
      'old'
    );
    let invalidated = false;
    const invalidation = invalidateCache('tenant-a:analytics').then(() => {
      invalidated = true;
    });
    const origin = vi.fn(async () => 'fresh');
    const fresh = cacheQuery('tenant-a:analytics', origin);
    await flush();
    expect(invalidated).toBe(false);
    expect(origin).not.toHaveBeenCalled();
    gate.resolve();
    await invalidation;
    expect(await fresh).toBe('fresh');
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected', {
        skipMemoryCache: true,
      })
    ).toBe('fresh');
  });

  it('prefix invalidation detaches matching loads while retaining unrelated tenants', async () => {
    const { cacheQuery, invalidateCacheByPrefix } = await import(
      '@/lib/db/cache'
    );
    const gate = deferred<string>();
    const old = cacheQuery('tenant-a:analytics', () => gate.promise);
    expect(await cacheQuery('tenant-b:analytics', async () => 'b')).toBe('b');
    await flush();
    await invalidateCacheByPrefix('tenant-a:');
    expect(await cacheQuery('tenant-a:analytics', async () => 'fresh')).toBe(
      'fresh'
    );
    gate.resolve('old');
    await old;
    expect(
      await cacheQuery('tenant-a:analytics', async () => 'unexpected')
    ).toBe('fresh');
    expect(
      await cacheQuery('tenant-b:analytics', async () => 'unexpected')
    ).toBe('b');
  });
});
