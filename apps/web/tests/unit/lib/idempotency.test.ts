import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildClaimIdempotencyKey,
  buildIdempotencyKey,
  buildRefreshIdempotencyKey,
} from '@/lib/idempotency';

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());
const mockExists = vi.hoisted(() => vi.fn());

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

describe('idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({
      set: mockSet,
      del: mockDel,
      exists: mockExists,
    });
  });

  it('returns backendUnavailable when Redis is required but missing', async () => {
    mockGetRedis.mockReturnValue(null);

    const { tryWithIdempotency } = await import('@/lib/idempotency');

    const result = await tryWithIdempotency(
      'critical-op',
      30,
      async () => 'ok',
      { requireBackend: true }
    );

    expect(result).toEqual({
      success: false,
      backendUnavailable: true,
      error: 'This action is temporarily unavailable. Please try again later.',
    });
  });

  it('distinguishes locked operations from backend unavailability', async () => {
    mockSet.mockResolvedValue(null);

    const { tryWithIdempotency } = await import('@/lib/idempotency');

    const result = await tryWithIdempotency('locked-op', 30, async () => 'ok');

    expect(result).toEqual({
      success: false,
      locked: true,
      error: 'This action is already in progress. Please wait.',
    });
  });

  it('throws a backend unavailable error when required by withIdempotency', async () => {
    mockGetRedis.mockReturnValue(null);

    const { IdempotencyBackendUnavailableError, withIdempotency } =
      await import('@/lib/idempotency');

    await expect(
      withIdempotency('critical-op-throw', 30, async () => 'ok', {
        requireBackend: true,
      })
    ).rejects.toEqual(expect.any(IdempotencyBackendUnavailableError));
  });

  it('falls back to in-memory locking when backend is optional', async () => {
    mockGetRedis.mockReturnValue(null);

    const { tryWithIdempotency } = await import('@/lib/idempotency');

    const result = await tryWithIdempotency(
      'non-critical-op',
      30,
      async () => 'ok'
    );

    expect(result).toEqual({
      success: true,
      data: 'ok',
    });
  });

  it('suppresses duplicate effects while an operation is in flight', async () => {
    mockGetRedis.mockReturnValue(null);

    const { IdempotencyError, withIdempotency } = await import(
      '@/lib/idempotency'
    );

    let release!: (value: string) => void;
    const gate = new Promise<string>(resolve => {
      release = resolve;
    });
    const calls: string[] = [];

    const first = withIdempotency('dup-effects', 30, async () => {
      calls.push('first');
      return gate;
    });

    await expect(
      withIdempotency('dup-effects', 30, async () => {
        calls.push('second');
        return 'second';
      })
    ).rejects.toEqual(expect.any(IdempotencyError));
    expect(calls).toEqual(['first']);

    release('done');
    await expect(first).resolves.toBe('done');

    await expect(
      withIdempotency('dup-effects', 30, async () => 'third')
    ).resolves.toBe('third');
  });

  it('releases the lock when the operation throws so retries can proceed', async () => {
    mockGetRedis.mockReturnValue(null);

    const { withIdempotency } = await import('@/lib/idempotency');

    await expect(
      withIdempotency('release-on-throw', 30, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(
      withIdempotency('release-on-throw', 30, async () => 'recovered')
    ).resolves.toBe('recovered');
  });

  it('returns the operation error and releases the lock in tryWithIdempotency', async () => {
    mockGetRedis.mockReturnValue(null);

    const { tryWithIdempotency } = await import('@/lib/idempotency');

    const failed = await tryWithIdempotency('try-error', 30, async () => {
      throw new Error('downstream failed');
    });
    expect(failed).toEqual({ success: false, error: 'downstream failed' });

    const retried = await tryWithIdempotency('try-error', 30, async () => 'ok');
    expect(retried).toEqual({ success: true, data: 'ok' });
  });

  it('fails closed when Redis is required but the backend throws', async () => {
    mockSet.mockRejectedValue(new Error('redis down'));

    const {
      IdempotencyBackendUnavailableError,
      tryWithIdempotency,
      withIdempotency,
    } = await import('@/lib/idempotency');

    await expect(
      withIdempotency('redis-throws', 30, async () => 'ok', {
        requireBackend: true,
      })
    ).rejects.toEqual(expect.any(IdempotencyBackendUnavailableError));

    const result = await tryWithIdempotency(
      'redis-throws-try',
      30,
      async () => 'ok',
      { requireBackend: true }
    );
    expect(result).toEqual({
      success: false,
      backendUnavailable: true,
      error: 'This action is temporarily unavailable. Please try again later.',
    });
  });

  it('reports lock state through isLocked on the Redis backend', async () => {
    const { isLocked } = await import('@/lib/idempotency');

    mockExists.mockResolvedValue(1);
    await expect(isLocked('held')).resolves.toBe(true);
    expect(mockExists).toHaveBeenCalledWith('idempotency:held');

    mockExists.mockResolvedValue(0);
    await expect(isLocked('free')).resolves.toBe(false);
  });

  it('returns the operation result for arbitrary keys and values', async () => {
    const { withIdempotency } = await import('@/lib/idempotency');
    mockSet.mockResolvedValue('OK');

    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9_-]{1,24}$/),
        fc.jsonValue(),
        async (key, value) => {
          const result = await withIdempotency(
            `prop:${key}`,
            30,
            async () => value
          );
          expect(result).toEqual(value);
          expect(mockSet).toHaveBeenCalledWith(
            `idempotency:prop:${key}`,
            '1',
            expect.objectContaining({ nx: true, ex: 30 })
          );
          expect(mockDel).toHaveBeenCalledWith(`idempotency:prop:${key}`);
        }
      )
    );
  });
});

describe('idempotency key builders', () => {
  const identifierArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

  it('claim keys are deterministic and never collide across distinct identities', () => {
    fc.assert(
      fc.property(
        identifierArb,
        identifierArb,
        identifierArb,
        identifierArb,
        (userA, artistA, userB, artistB) => {
          const keyA = buildClaimIdempotencyKey(userA, artistA);
          expect(keyA).toBe(`claim:${userA}:${artistA}`);
          if (userA !== userB || artistA !== artistB) {
            expect(buildClaimIdempotencyKey(userB, artistB)).not.toBe(keyA);
          }
        }
      )
    );
  });

  it('refresh keys are namespaced and deterministic', () => {
    fc.assert(
      fc.property(identifierArb, artistId => {
        const key = buildRefreshIdempotencyKey(artistId);
        expect(key).toBe(`refresh:${artistId}`);
        expect(buildRefreshIdempotencyKey(artistId)).toBe(key);
      })
    );
  });

  it('generic keys encode operation and identifiers in order', () => {
    fc.assert(
      fc.property(
        identifierArb,
        fc.array(identifierArb, { minLength: 0, maxLength: 5 }),
        (operation, identifiers) => {
          const key = buildIdempotencyKey(operation, ...identifiers);
          expect(key).toBe([operation, ...identifiers].join(':'));
          expect(
            key.startsWith(`${operation}:`) || identifiers.length === 0
          ).toBe(true);
        }
      )
    );
  });
});
