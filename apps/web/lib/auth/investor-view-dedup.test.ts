/**
 * Unit tests for investor-view-dedup.ts
 *
 * Covers:
 * - First call returns true (SET NX returns "OK" → new key)
 * - Second call within 5 min returns false (SET NX returns null → key exists)
 * - After TTL expires (simulated by a fresh "OK"), returns true again
 * - Redis unreachable (getRedis returns null) → fail-open (returns true)
 * - Redis set() throws → fail-open (returns true)
 * - Different visitorKeys don't collide
 * - Different routes don't collide for the same visitorKey
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
  };
}

// ============================================================================
// Import SUT after mocks are in place
// ============================================================================

import { shouldRecordInvestorView } from './investor-view-dedup';

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
      `investor:view:dedup:${VISITOR_A}:${ROUTE_OVERVIEW}`,
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

  it('different visitorKeys use independent dedup keys (no collision)', async () => {
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
      `investor:view:dedup:${VISITOR_A}:${ROUTE_OVERVIEW}`,
      1,
      expect.objectContaining({ nx: true })
    );
    expect(redisB.set).toHaveBeenCalledWith(
      `investor:view:dedup:${VISITOR_B}:${ROUTE_OVERVIEW}`,
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
      `investor:view:dedup:${VISITOR_A}:${ROUTE_OVERVIEW}`,
      1,
      expect.objectContaining({ nx: true })
    );
    expect(redis2.set).toHaveBeenCalledWith(
      `investor:view:dedup:${VISITOR_A}:${ROUTE_FINANCIALS}`,
      1,
      expect.objectContaining({ nx: true })
    );
  });
});
