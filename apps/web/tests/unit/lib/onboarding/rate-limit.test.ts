/**
 * Real IP-based onboarding rate-limit threshold coverage.
 *
 * Every other test that touches onboarding rate limiting (intake.test.ts,
 * complete-onboarding.test.ts, app/onboarding/actions/index.test.ts) mocks
 * `@/lib/onboarding/rate-limit` wholesale, so the actual 3-attempts/hour
 * IP-based enforcement inside `checkOnboardingRateLimit` (via the shared
 * `onboardingLimiter`) is never exercised for real — only the route's
 * handling of a pre-canned rejection is. This file exercises the real
 * counting logic end-to-end: real `enforceOnboardingRateLimit`, real
 * `checkOnboardingRateLimit`, real `RateLimiter`, real `MemoryRateLimiter`.
 *
 * The only mocked boundary is the Redis client accessor (network) so the
 * limiter deterministically falls back to the real in-memory implementation
 * regardless of ambient Upstash credentials in the environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

import {
  enforceOnboardingRateLimit,
  getOnboardingRateLimitMessage,
} from '@/lib/onboarding/rate-limit';
import { clearStore } from '@/lib/rate-limit/memory-limiter';

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected enforceOnboardingRateLimit to reject');
}

describe('enforceOnboardingRateLimit — real IP threshold (unmocked limiter)', () => {
  beforeEach(() => {
    clearStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStore();
  });

  it('allows exactly 3 onboarding attempts per IP per hour across distinct users, then blocks the 4th with the network-specific message', async () => {
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
    const exhaustedIp = '198.51.100.9';
    const freshIp = '198.51.100.10';

    await enforceOnboardingRateLimit({ userId: 'viewer-0', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'viewer-1', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'viewer-2', ip: exhaustedIp });

    // exhausted IP's 4th distinct-user request now fails
    await expect(
      enforceOnboardingRateLimit({ userId: 'viewer-blocked', ip: exhaustedIp })
    ).rejects.toThrow('Too many onboarding attempts from this network');

    // A brand-new IP is completely unaffected by the exhausted bucket.
    await expect(
      enforceOnboardingRateLimit({ userId: 'viewer-fresh', ip: freshIp })
    ).resolves.toBeUndefined();
  });

  it('enforces the per-user threshold (not the network message) when checkIP is false', async () => {
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

    // Must be the per-user message, NOT the "from this network" variant —
    // proves the IP check was actually skipped rather than coincidentally
    // also blocking.
    expect(getOnboardingRateLimitMessage(error)).toBe(
      'Too many onboarding attempts. Please try again in 1 hour.'
    );
  });

  it('actually skips the IP bucket when checkIP is false: a fresh user on an exhausted IP still passes', async () => {
    const exhaustedIp = '10.9.9.9';
    // Exhaust the IP bucket with three distinct users (checkIP defaults on).
    await enforceOnboardingRateLimit({ userId: 'ip-user-1', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'ip-user-2', ip: exhaustedIp });
    await enforceOnboardingRateLimit({ userId: 'ip-user-3', ip: exhaustedIp });
    // Sanity: a fourth user WITH the IP check is blocked by the network bucket.
    await expect(
      enforceOnboardingRateLimit({ userId: 'ip-user-4', ip: exhaustedIp })
    ).rejects.toThrow();

    // The load-bearing skip assertion: same exhausted IP, brand-new user,
    // checkIP:false must RESOLVE. A mutant that ignores the flag rejects here.
    await expect(
      enforceOnboardingRateLimit({
        userId: 'brand-new-user',
        ip: exhaustedIp,
        checkIP: false,
      })
    ).resolves.toBeUndefined();
  });
});
