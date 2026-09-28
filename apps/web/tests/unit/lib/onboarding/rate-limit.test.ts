/**
 * Onboarding rate-limit coverage for the fail-closed Redis outage policy.
 *
 * Onboarding is mandatory (`requireRedis: true`). Without a durable backend
 * the first attempt deny/unavailable maps to RATE_LIMITED — the unmocked
 * in-memory path must not admit 3 attempts. The 3-then-block IP threshold is
 * only exercised against a working redis/mock backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateRedisRateLimiter } = vi.hoisted(() => ({
  mockCreateRedisRateLimiter: vi.fn(),
}));

vi.mock('@/lib/rate-limit/redis-limiter', () => ({
  createRedisRateLimiter: mockCreateRedisRateLimiter,
  isRedisAvailable: () => false,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  isRedisQuotaCircuitOpen: vi.fn().mockReturnValue(false),
  closeRedisQuotaCircuit: vi.fn(),
  noteRedisCommandFailure: vi.fn(),
}));

import { clearStore, MemoryRateLimiter } from '@/lib/rate-limit/memory-limiter';
import type { RateLimitConfig } from '@/lib/rate-limit/types';

function createCountingRedisBackend(config: RateLimitConfig) {
  const memory = new MemoryRateLimiter(config);
  return {
    limit: async (identifier: string) => {
      const result = await memory.limit(identifier);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset.getTime(),
      };
    },
  };
}

async function loadOnboardingRateLimit() {
  const { checkOnboardingRateLimit } = await import('@/lib/rate-limit');
  const onboarding = await import('@/lib/onboarding/rate-limit');
  return { checkOnboardingRateLimit, ...onboarding };
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected enforceOnboardingRateLimit to reject');
}

describe('enforceOnboardingRateLimit — Redis unavailable (fail-closed)', () => {
  beforeEach(() => {
    clearStore();
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', 'production');
    mockCreateRedisRateLimiter.mockReset();
    mockCreateRedisRateLimiter.mockReturnValue(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStore();
  });

  it('pins onboarding as requireRedis so a revert cannot silently reopen memory fallback', async () => {
    const { RATE_LIMITERS } = await import('@/lib/rate-limit/config');
    expect(RATE_LIMITERS.onboarding.requireRedis).toBe(true);
  });

  it('fail-closes the first onboarding attempt when Redis is unavailable', async () => {
    const {
      checkOnboardingRateLimit,
      enforceOnboardingRateLimit,
      getOnboardingRateLimitMessage,
    } = await loadOnboardingRateLimit();
    const ip = '203.0.113.5';

    const result = await checkOnboardingRateLimit('user-a', ip);
    expect(result.success).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.backend).toBe('unavailable');
    expect(result.remaining).toBe(0);

    const error = await captureRejection(
      enforceOnboardingRateLimit({ userId: 'user-b', ip })
    );
    expect(error.message).toBe(
      '[RATE_LIMITED] Too many onboarding attempts. Please try again in 1 hour.'
    );
    expect(getOnboardingRateLimitMessage(error)).toBe(
      'Too many onboarding attempts. Please try again in 1 hour.'
    );
  });

  it('fail-closes a later distinct user on a different IP rather than admitting 3 in-memory attempts', async () => {
    const { enforceOnboardingRateLimit } = await loadOnboardingRateLimit();

    await expect(
      enforceOnboardingRateLimit({ userId: 'user-a', ip: '203.0.113.5' })
    ).rejects.toThrow('[RATE_LIMITED]');
    await expect(
      enforceOnboardingRateLimit({ userId: 'user-b', ip: '198.51.100.9' })
    ).rejects.toThrow('[RATE_LIMITED]');
  });

  it('fail-closes on the first attempt even when checkIP is false', async () => {
    const { enforceOnboardingRateLimit, getOnboardingRateLimitMessage } =
      await loadOnboardingRateLimit();

    const error = await captureRejection(
      enforceOnboardingRateLimit({
        userId: 'solo-user',
        ip: '10.0.0.1',
        checkIP: false,
      })
    );
    expect(getOnboardingRateLimitMessage(error)).toBe(
      'Too many onboarding attempts. Please try again in 1 hour.'
    );
  });
});

describe('enforceOnboardingRateLimit — working redis/mock backend (IP threshold)', () => {
  beforeEach(() => {
    clearStore();
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', 'production');
    mockCreateRedisRateLimiter.mockReset();
    mockCreateRedisRateLimiter.mockImplementation((config: RateLimitConfig) =>
      createCountingRedisBackend(config)
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStore();
  });

  it('allows exactly 3 onboarding attempts per IP per hour across distinct users, then blocks the 4th with the network-specific message', async () => {
    const { enforceOnboardingRateLimit, getOnboardingRateLimitMessage } =
      await loadOnboardingRateLimit();
    const ip = '203.0.113.5';

    await expect(
      enforceOnboardingRateLimit({ userId: 'user-a', ip })
    ).resolves.toBeUndefined();
    await expect(
      enforceOnboardingRateLimit({ userId: 'user-b', ip })
    ).resolves.toBeUndefined();
    await expect(
      enforceOnboardingRateLimit({ userId: 'user-c', ip })
    ).resolves.toBeUndefined();

    // 4th distinct user, same IP: each user's own bucket is fresh (would
    // pass on its own), so only the shared IP bucket can cause this failure.
    const error = await captureRejection(
      enforceOnboardingRateLimit({ userId: 'user-d', ip })
    );

    expect(error.message).toBe(
      '[RATE_LIMITED] Too many onboarding attempts from this network. Please try again in 1 hour.'
    );
    expect(getOnboardingRateLimitMessage(error)).toBe(
      'Too many onboarding attempts from this network. Please try again in 1 hour.'
    );
  });

  it('does not block a different IP once another IP is exhausted (bucket isolation)', async () => {
    const { enforceOnboardingRateLimit } = await loadOnboardingRateLimit();
    const exhaustedIp = '198.51.100.9';
    const freshIp = '198.51.100.10';

    await enforceOnboardingRateLimit({ userId: 'viewer-0', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'viewer-1', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'viewer-2', ip: exhaustedIp });

    await expect(
      enforceOnboardingRateLimit({
        userId: 'viewer-blocked',
        ip: exhaustedIp,
      })
    ).rejects.toThrow('Too many onboarding attempts from this network');

    await expect(
      enforceOnboardingRateLimit({ userId: 'viewer-fresh', ip: freshIp })
    ).resolves.toBeUndefined();
  });

  it('enforces the per-user threshold (not the network message) when checkIP is false', async () => {
    const { enforceOnboardingRateLimit, getOnboardingRateLimitMessage } =
      await loadOnboardingRateLimit();
    const userId = 'solo-user';

    await enforceOnboardingRateLimit({
      userId,
      ip: '10.0.0.1',
      checkIP: false,
    });
    await enforceOnboardingRateLimit({
      userId,
      ip: '10.0.0.2',
      checkIP: false,
    });
    await enforceOnboardingRateLimit({
      userId,
      ip: '10.0.0.3',
      checkIP: false,
    });

    const error = await captureRejection(
      enforceOnboardingRateLimit({ userId, ip: '10.0.0.4', checkIP: false })
    );

    expect(getOnboardingRateLimitMessage(error)).toBe(
      'Too many onboarding attempts. Please try again in 1 hour.'
    );
  });

  it('actually skips the IP bucket when checkIP is false: a fresh user on an exhausted IP still passes', async () => {
    const { enforceOnboardingRateLimit } = await loadOnboardingRateLimit();
    const exhaustedIp = '10.9.9.9';
    await enforceOnboardingRateLimit({ userId: 'ip-user-1', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'ip-user-2', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'ip-user-3', ip: exhaustedIp });
    await expect(
      enforceOnboardingRateLimit({ userId: 'ip-user-4', ip: exhaustedIp })
    ).rejects.toThrow();

    await expect(
      enforceOnboardingRateLimit({
        userId: 'brand-new-user',
        ip: exhaustedIp,
        checkIP: false,
      })
    ).resolves.toBeUndefined();
  });
});

describe('enforceOnboardingRateLimit — non-production in-memory store', () => {
  beforeEach(() => {
    clearStore();
    vi.resetModules();
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'test');
    mockCreateRedisRateLimiter.mockReset();
    mockCreateRedisRateLimiter.mockReturnValue(null);
  });

  afterEach(() => {
    clearStore();
    vi.unstubAllEnvs();
  });

  it('allows the first requireRedis attempt instead of failing closed', async () => {
    const { enforceOnboardingRateLimit } = await loadOnboardingRateLimit();

    await expect(
      enforceOnboardingRateLimit({ userId: 'dev-user', ip: '203.0.113.50' })
    ).resolves.toBeUndefined();
    expect(mockCreateRedisRateLimiter).not.toHaveBeenCalled();
  });
});
