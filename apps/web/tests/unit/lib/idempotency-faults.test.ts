import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * JOV-6048 — isolated fault-injection experiments for the cache/Redis
 * dependency family's idempotency contract.
 *
 * Steady state: Redis SET NX acquires the lock, DEL releases it, the wrapped
 * operation runs exactly once per key.
 *
 * Contract under test (success is NOT "the process stayed alive"):
 * - No duplicated work: a concurrent same-key call never runs fn twice.
 * - Truthful state: a successful operation reports success even if the lock
 *   release fails; an operation failure is never masked by a release failure.
 * - Bounded degradation: backend outage degrades to a per-process memory lock
 *   (or a typed unavailable error when requireBackend is set).
 * - Recovery: once Redis returns, the distributed path resumes and no stale
 *   fallback lock falsely reports "in progress".
 * - Observability: release failures are captured as warnings.
 */

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  captureWarning: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/redis', () => ({ getRedis: mocks.getRedis }));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mocks.captureWarning,
}));

import {
  IdempotencyBackendUnavailableError,
  IdempotencyError,
  isLocked,
  tryWithIdempotency,
  withIdempotency,
} from '@/lib/idempotency';

interface FakeRedis {
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

function createFakeRedis(): FakeRedis {
  const held = new Set<string>();
  return {
    set: vi.fn(async (key: string, _v: string, opts: { nx?: boolean }) => {
      if (opts?.nx && held.has(key)) return null;
      held.add(key);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      held.delete(key);
      return 1;
    }),
    exists: vi.fn(async (key: string) => (held.has(key) ? 1 : 0)),
  };
}

/** A deferred fn so we can hold the first call in-flight while a duplicate arrives. */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('idempotency under cache faults (JOV-6048)', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    vi.clearAllMocks();
    redis = createFakeRedis();
    mocks.getRedis.mockReturnValue(redis);
  });

  it('duplicated submission under healthy Redis runs the operation exactly once', async () => {
    const gate = createDeferred<string>();
    const fn = vi.fn(() => gate.promise);

    const first = withIdempotency('dup-healthy', 30, fn);
    // Let the first call acquire the lock before the duplicate arrives.
    await vi.waitFor(() => expect(redis.set).toHaveBeenCalledTimes(1));

    await expect(withIdempotency('dup-healthy', 30, fn)).rejects.toBeInstanceOf(
      IdempotencyError
    );
    gate.resolve('done');
    await expect(first).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('Redis outage at acquire degrades to memory lock and still blocks duplicates', async () => {
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.del.mockRejectedValue(new Error('ECONNREFUSED'));

    const gate = createDeferred<string>();
    const fn = vi.fn(() => gate.promise);

    const first = withIdempotency('dup-outage', 30, fn);
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));

    await expect(withIdempotency('dup-outage', 30, fn)).rejects.toBeInstanceOf(
      IdempotencyError
    );
    gate.resolve('done');
    await expect(first).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a lock acquired during an outage still blocks duplicates after Redis recovers', async () => {
    redis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const gate = createDeferred<string>();
    const fn = vi.fn(() => gate.promise);

    const first = withIdempotency('flap', 30, fn);
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1));

    // Redis "recovered": the distributed lock is free, but this process is
    // still running the operation — the fallback lock must hold.
    await expect(withIdempotency('flap', 30, fn)).rejects.toBeInstanceOf(
      IdempotencyError
    );
    gate.resolve('done');
    await expect(first).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('release failure after a successful operation still reports success and warns', async () => {
    redis.del.mockRejectedValue(new Error('socket hang up'));

    const fn = vi.fn(async () => 'committed');

    await expect(withIdempotency('release-fail', 30, fn)).resolves.toBe(
      'committed'
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'Idempotency lock release failed',
      expect.any(Error),
      expect.objectContaining({ context: 'idempotency.releaseLock' })
    );
  });

  it('release failure does not mask the operation error', async () => {
    redis.del.mockRejectedValue(new Error('socket hang up'));

    const fn = vi.fn(async () => {
      throw new Error('operation exploded');
    });

    await expect(withIdempotency('release-mask', 30, fn)).rejects.toThrow(
      'operation exploded'
    );
  });

  it('stale fallback locks do not falsely report "in progress" after release', async () => {
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      withIdempotency('stale-lock', 30, async () => 'ok')
    ).resolves.toBe('ok');

    // Redis still down: the fallback lock must have been released.
    await expect(
      withIdempotency('stale-lock', 30, async () => 'ok-again')
    ).resolves.toBe('ok-again');
  });

  it('isLocked answers truthfully during a Redis outage', async () => {
    redis.exists.mockRejectedValue(new Error('ETIMEDOUT'));
    redis.set.mockRejectedValue(new Error('ETIMEDOUT'));
    redis.del.mockRejectedValue(new Error('ETIMEDOUT'));

    const gate = createDeferred<string>();
    const pending = withIdempotency('islocked-outage', 30, () => gate.promise);
    await vi.waitFor(() => expect(redis.set).toHaveBeenCalled());

    await expect(isLocked('islocked-outage')).resolves.toBe(true);
    gate.resolve('done');
    await pending;
    await expect(isLocked('islocked-outage')).resolves.toBe(false);
  });

  it('requireBackend fails closed with a typed error and runs no work', async () => {
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const fn = vi.fn(async () => 'never');

    await expect(
      withIdempotency('required', 30, fn, { requireBackend: true })
    ).rejects.toBeInstanceOf(IdempotencyBackendUnavailableError);
    expect(fn).not.toHaveBeenCalled();

    const result = await tryWithIdempotency('required-try', 30, fn, {
      requireBackend: true,
    });
    expect(result.backendUnavailable).toBe(true);
    expect(result.success).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('recovers to the distributed lock path after Redis returns', async () => {
    redis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      withIdempotency('recover', 30, async () => 'fallback-run')
    ).resolves.toBe('fallback-run');

    // Post-recovery duplicate contention must be arbitrated by Redis NX.
    redis.set.mockResolvedValueOnce(null);
    await expect(
      withIdempotency('recover', 30, async () => 'never')
    ).rejects.toBeInstanceOf(IdempotencyError);

    redis.set.mockResolvedValueOnce('OK');
    await expect(
      withIdempotency('recover', 30, async () => 'redis-run')
    ).resolves.toBe('redis-run');
  });
});
