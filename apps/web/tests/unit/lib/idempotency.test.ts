import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());

vi.mock('@/lib/redis', () => ({
  getRedis: mockGetRedis,
}));

describe('idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({
      set: mockSet,
      del: mockDel,
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
});
