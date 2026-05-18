/**
 * Unit tests for sentry-rate-limit.ts
 *
 * Covers:
 * - captureError fires on first event (SET NX returns "OK")
 * - captureError is suppressed on subsequent events (SET NX returns null)
 * - Redis-unreachable path allows captureError to fire (fail-open)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
  captureError: vi.fn().mockResolvedValue(undefined),
  redisSet: vi.fn<() => Promise<'OK' | null>>(),
  getRedis: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: mocks.getRedis,
}));

// ============================================================================
// Helpers
// ============================================================================

function makeRedisClient(setResult: 'OK' | null | Error) {
  return {
    set: vi.fn().mockImplementation(() => {
      if (setResult instanceof Error) return Promise.reject(setResult);
      return Promise.resolve(setResult);
    }),
  };
}

// ============================================================================
// Import SUT after mocks are in place
// ============================================================================

import { captureErrorWithHostnameLimit } from './sentry-rate-limit';

const TEST_HOSTNAME = 'staging.jov.ie';
const TEST_ERROR = new Error('Clerk is down');
const TEST_MESSAGE = '[middleware] Clerk config missing';

describe('captureErrorWithHostnameLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisSet.mockReset();
  });

  it('fires captureError and returns true on first event (SET NX returns OK)', async () => {
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      `sentry:rate:clerk-degraded:${TEST_HOSTNAME}`,
      1,
      { nx: true, ex: 60 }
    );
    expect(mocks.captureError).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      TEST_MESSAGE,
      TEST_ERROR,
      expect.objectContaining({ hostname: TEST_HOSTNAME })
    );
  });

  it('suppresses captureError and returns false on subsequent events (SET NX returns null)', async () => {
    const redis = makeRedisClient(null);
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(false);
    expect(redis.set).toHaveBeenCalledOnce();
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable: fires captureError and returns true', async () => {
    mocks.getRedis.mockReturnValue(null);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(true);
    expect(mocks.captureError).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      TEST_MESSAGE,
      TEST_ERROR,
      expect.objectContaining({
        hostname: TEST_HOSTNAME,
        rateLimit: 'redis-unavailable',
      })
    );
  });

  it('fails open when Redis set throws: fires captureError and returns true', async () => {
    const redis = makeRedisClient(new Error('Connection refused'));
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(true);
    expect(mocks.captureError).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      TEST_MESSAGE,
      TEST_ERROR,
      expect.objectContaining({
        hostname: TEST_HOSTNAME,
        rateLimit: 'rate-limit-error',
      })
    );
  });

  it('forwards extra context to captureError', async () => {
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME,
      {
        context: { pathname: '/app/dashboard', extraField: 42 },
      }
    );

    expect(mocks.captureError).toHaveBeenCalledWith(
      TEST_MESSAGE,
      TEST_ERROR,
      expect.objectContaining({
        hostname: TEST_HOSTNAME,
        pathname: '/app/dashboard',
        extraField: 42,
      })
    );
  });

  it('uses the correct Redis key per hostname', async () => {
    const redis1 = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis1);
    await captureErrorWithHostnameLimit(TEST_MESSAGE, TEST_ERROR, 'jov.ie');

    const redis2 = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis2);
    await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      'staging.jov.ie'
    );

    expect(redis1.set).toHaveBeenCalledWith(
      'sentry:rate:clerk-degraded:jov.ie',
      1,
      expect.objectContaining({ nx: true })
    );
    expect(redis2.set).toHaveBeenCalledWith(
      'sentry:rate:clerk-degraded:staging.jov.ie',
      1,
      expect.objectContaining({ nx: true })
    );
  });
});
