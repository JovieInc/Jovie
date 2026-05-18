/**
 * Unit tests for sentry-rate-limit.ts
 *
 * Covers:
 * - captureError fires on first event (count == 1)
 * - captureError is suppressed on subsequent events (count > 1)
 * - Redis-unreachable path allows captureError to fire (fail-open)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
  captureError: vi.fn().mockResolvedValue(undefined),
  redisIncr: vi.fn<() => Promise<number>>(),
  redisExpire: vi.fn<() => Promise<void>>(),
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

function makeRedisClient(incrResult: number | Error) {
  return {
    incr: vi.fn().mockImplementation(() => {
      if (incrResult instanceof Error) return Promise.reject(incrResult);
      return Promise.resolve(incrResult);
    }),
    expire: mocks.redisExpire.mockResolvedValue(undefined),
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
    mocks.redisIncr.mockReset();
    mocks.redisExpire.mockReset();
  });

  it('fires captureError and returns true on first event (count=1)', async () => {
    const redis = makeRedisClient(1);
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(true);
    expect(redis.incr).toHaveBeenCalledWith(
      `sentry:rate:clerk-degraded:${TEST_HOSTNAME}`
    );
    expect(redis.expire).toHaveBeenCalledWith(
      `sentry:rate:clerk-degraded:${TEST_HOSTNAME}`,
      60
    );
    expect(mocks.captureError).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      TEST_MESSAGE,
      TEST_ERROR,
      expect.objectContaining({ hostname: TEST_HOSTNAME })
    );
  });

  it('suppresses captureError and returns false on subsequent events (count=2)', async () => {
    const redis = makeRedisClient(2);
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(false);
    expect(redis.incr).toHaveBeenCalledOnce();
    // expire should NOT be called for count > 1
    expect(redis.expire).not.toHaveBeenCalled();
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it('suppresses captureError and returns false for high count (count=100)', async () => {
    const redis = makeRedisClient(100);
    mocks.getRedis.mockReturnValue(redis);

    const result = await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      TEST_HOSTNAME
    );

    expect(result).toBe(false);
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

  it('fails open when Redis incr throws: fires captureError and returns true', async () => {
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
    const redis = makeRedisClient(1);
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
    const redis1 = makeRedisClient(1);
    mocks.getRedis.mockReturnValue(redis1);
    await captureErrorWithHostnameLimit(TEST_MESSAGE, TEST_ERROR, 'jov.ie');

    const redis2 = makeRedisClient(1);
    mocks.getRedis.mockReturnValue(redis2);
    await captureErrorWithHostnameLimit(
      TEST_MESSAGE,
      TEST_ERROR,
      'staging.jov.ie'
    );

    expect(redis1.incr).toHaveBeenCalledWith(
      'sentry:rate:clerk-degraded:jov.ie'
    );
    expect(redis2.incr).toHaveBeenCalledWith(
      'sentry:rate:clerk-degraded:staging.jov.ie'
    );
  });
});
