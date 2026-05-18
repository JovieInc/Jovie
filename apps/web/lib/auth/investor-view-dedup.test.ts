/**
 * Unit tests for investor-view-dedup.ts
 *
 * Covers:
 * - First call returns true (SET NX returns "OK" → new key)
 * - Second call within 5 min returns false (SET NX returns null → key exists)
 * - After TTL expires (simulated by a fresh "OK"), returns true again
 * - Redis unreachable (getRedis returns null) → fail-open (returns true)
 * - Redis set() throws → fail-open (returns true)
 * - Different visitorKeys don't collide (different hashes)
 * - Different routes don't collide for the same visitorKey
 * - Raw visitorKey is NOT present in the Redis key (token never leaks to key-space)
 * - releaseInvestorViewDedup calls DEL on the correct key
 * - releaseInvestorViewDedup is a no-op when Redis unavailable
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
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
    del: vi.fn().mockResolvedValue(1),
  };
}

/** Derive the expected Redis key using the same SHA-256 approach as the SUT. */
async function expectedKey(visitorKey: string, route: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(visitorKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `investor:view:dedup:${keyHash}:${route}`;
}

// ============================================================================
// Import SUT after mocks are in place
// ============================================================================

import {
  releaseInvestorViewDedup,
  shouldRecordInvestorView,
} from './investor-view-dedup';

const VISITOR_A = 'user_abc123';
const VISITOR_B = 'hash_192.168.1.1_aabbccdd';
const ROUTE_OVERVIEW = '/investor-portal';
const ROUTE_FINANCIALS = '/investor-portal/financials';

describe('shouldRecordInvestorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true on first visit (SET NX returns OK)', async () => {
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    const result = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(result).toBe(true);
    expect(redis.set).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      await expectedKey(VISITOR_A, ROUTE_OVERVIEW),
      1,
      { nx: true, ex: 300 }
    );
  });

  it('returns false within dedup window (SET NX returns null)', async () => {
    const redis = makeRedisClient(null);
    mocks.getRedis.mockReturnValue(redis);

    const result = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(result).toBe(false);
    expect(redis.set).toHaveBeenCalledOnce();
  });

  it('returns true again after TTL expires (simulated as OK)', async () => {
    // After the 5-min key expires, SET NX returns "OK" again for the same pair.
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    const result = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(result).toBe(true);
  });

  it('fails open when Redis is unavailable (getRedis returns null)', async () => {
    mocks.getRedis.mockReturnValue(null);

    const result = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(result).toBe(true);
  });

  it('fails open when Redis set() throws', async () => {
    const redis = makeRedisClient(new Error('Connection refused'));
    mocks.getRedis.mockReturnValue(redis);

    const result = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(result).toBe(true);
  });

  it('does NOT include the raw visitorKey in the Redis key (token stays out of key-space)', async () => {
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    const [[calledKey]] = redis.set.mock.calls as [[string, ...unknown[]]];
    expect(calledKey).not.toContain(VISITOR_A);
    expect(calledKey).toMatch(/^investor:view:dedup:[0-9a-f]{16}:/);
  });

  it('different visitorKeys use independent dedup keys (different hashes)', async () => {
    const keyA = await expectedKey(VISITOR_A, ROUTE_OVERVIEW);
    const keyB = await expectedKey(VISITOR_B, ROUTE_OVERVIEW);

    // Keys must differ
    expect(keyA).not.toBe(keyB);

    const redisA = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redisA);
    await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    const redisB = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redisB);
    await shouldRecordInvestorView({
      visitorKey: VISITOR_B,
      route: ROUTE_OVERVIEW,
    });

    expect(redisA.set).toHaveBeenCalledWith(
      keyA,
      1,
      expect.objectContaining({ nx: true })
    );
    expect(redisB.set).toHaveBeenCalledWith(
      keyB,
      1,
      expect.objectContaining({ nx: true })
    );
  });

  it('different routes use independent dedup keys for the same visitor', async () => {
    const redis1 = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis1);
    const result1 = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    const redis2 = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis2);
    const result2 = await shouldRecordInvestorView({
      visitorKey: VISITOR_A,
      route: ROUTE_FINANCIALS,
    });

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(redis1.set).toHaveBeenCalledWith(
      await expectedKey(VISITOR_A, ROUTE_OVERVIEW),
      1,
      expect.objectContaining({ nx: true })
    );
    expect(redis2.set).toHaveBeenCalledWith(
      await expectedKey(VISITOR_A, ROUTE_FINANCIALS),
      1,
      expect.objectContaining({ nx: true })
    );
  });
});

describe('releaseInvestorViewDedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DEL on the correct hashed key', async () => {
    const redis = makeRedisClient('OK');
    mocks.getRedis.mockReturnValue(redis);

    await releaseInvestorViewDedup({
      visitorKey: VISITOR_A,
      route: ROUTE_OVERVIEW,
    });

    expect(redis.del).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalledWith(
      await expectedKey(VISITOR_A, ROUTE_OVERVIEW)
    );
  });

  it('is a no-op when Redis is unavailable', async () => {
    mocks.getRedis.mockReturnValue(null);

    // Should not throw
    await expect(
      releaseInvestorViewDedup({
        visitorKey: VISITOR_A,
        route: ROUTE_OVERVIEW,
      })
    ).resolves.toBeUndefined();
  });

  it('swallows Redis errors silently', async () => {
    const redis = {
      set: vi.fn(),
      del: vi.fn().mockRejectedValue(new Error('Redis error')),
    };
    mocks.getRedis.mockReturnValue(redis);

    // Should not throw
    await expect(
      releaseInvestorViewDedup({
        visitorKey: VISITOR_A,
        route: ROUTE_OVERVIEW,
      })
    ).resolves.toBeUndefined();
  });
});
