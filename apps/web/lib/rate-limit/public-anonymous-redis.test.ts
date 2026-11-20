import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ limit: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  env: { NODE_ENV: 'production', VERCEL_ENV: 'production' },
}));
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  metrics: { count: vi.fn() },
}));
vi.mock('@/lib/redis', () => ({
  closeRedisQuotaCircuit: vi.fn(),
  isRedisQuotaCircuitOpen: () => false,
  noteRedisCommandFailure: vi.fn(),
}));
vi.mock('./redis-limiter', () => ({
  createRedisRateLimiter: mocks.create,
  isRedisAvailable: () => true,
}));

import { RATE_LIMITERS, type RateLimiterName } from './config';
import { MemoryRateLimiter } from './memory-limiter';
import { PUBLIC_ANONYMOUS_RATE_LIMITERS } from './public-anonymous-config';
import { resetRedisCircuitBreaker } from './rate-limiter';
import type { RateLimitConfig } from './types';

/**
 * Documented exceptions to durable public anonymous rate limits.
 * Everything else with trafficClass anonymous must set requireRedis.
 */
const ANONYMOUS_REQUIRE_REDIS_EXCEPTIONS = new Set<RateLimiterName>([
  // JOV-6114: Turnstile-gated first touch may memory-degrade on Redis outage.
  'anonymousOnboardingChatFirstTouch',
  // localOnly probes — deliberately preferRedis:false, no Upstash.
  'health',
  'spotifyPublicSearch',
]);

const names = [
  'handleCheck',
  'publicProfileCaptureDismissal',
  'publicProfilePacEvent',
] as const;

beforeEach(() => {
  mocks.limit.mockReset();
  mocks.create.mockReturnValue({ limit: mocks.limit });
  resetRedisCircuitBreaker();
});

describe('public anonymous Redis durability (SEC-04)', () => {
  it('preserves public exports and administrative census singleton identity', async () => {
    const instances = await import('./public-anonymous-limiters');
    const central = await import('./limiters');
    const publicApi = await import('./index');
    expect(central.handleCheckLimiter).toBe(instances.handleCheckLimiter);
    expect(central.publicProfileCaptureDismissalLimiter).toBe(
      instances.publicProfileCaptureDismissalLimiter
    );
    expect(central.publicProfilePacEventLimiter).toBe(
      instances.publicProfilePacEventLimiter
    );
    expect(publicApi.handleCheckLimiter).toBe(instances.handleCheckLimiter);
    expect(central.getAllLimiters().handleCheck).toBe(
      instances.handleCheckLimiter
    );
    expect(central.getAllLimiters().publicProfilePacEvent).toBe(
      instances.publicProfilePacEventLimiter
    );
  });

  it('pins every anonymous limiter to requireRedis except documented exceptions', () => {
    const missing = (Object.keys(RATE_LIMITERS) as RateLimiterName[])
      .filter(name => RATE_LIMITERS[name].trafficClass === 'anonymous')
      .filter(name => !ANONYMOUS_REQUIRE_REDIS_EXCEPTIONS.has(name))
      .filter(
        name => (RATE_LIMITERS[name] as RateLimitConfig).requireRedis !== true
      )
      .sort((a, b) => a.localeCompare(b));

    expect(missing).toEqual([]);
  });

  it.each(names)(
    'keeps %s on its canonical durable public-anonymous policy',
    name => {
      expect(RATE_LIMITERS[name]).toBe(PUBLIC_ANONYMOUS_RATE_LIMITERS[name]);
      expect(RATE_LIMITERS[name]).toMatchObject({
        trafficClass: 'anonymous',
        requireRedis: true,
        analytics: false,
        algorithm: 'fixed-window',
      });
    }
  );

  it.each(names)(
    'preserves allowed and throttled Redis outcomes for %s',
    async name => {
      const {
        handleCheckLimiter,
        publicProfileCaptureDismissalLimiter,
        publicProfilePacEventLimiter,
      } = await import('./public-anonymous-limiters');
      const limiter =
        name === 'handleCheck'
          ? handleCheckLimiter
          : name === 'publicProfileCaptureDismissal'
            ? publicProfileCaptureDismissalLimiter
            : publicProfilePacEventLimiter;
      const reset = Date.now() + 60_000;
      mocks.limit
        .mockResolvedValueOnce({
          success: true,
          limit: RATE_LIMITERS[name].limit,
          remaining: RATE_LIMITERS[name].limit - 1,
          reset,
        })
        .mockResolvedValueOnce({
          success: false,
          limit: RATE_LIMITERS[name].limit,
          remaining: 0,
          reset,
        });

      expect(await limiter.limit('fixture-ip')).toMatchObject({
        success: true,
        backend: 'redis',
      });
      expect(await limiter.limit('fixture-ip')).toMatchObject({
        success: false,
        backend: 'redis',
        reset: new Date(reset),
        reason: `${RATE_LIMITERS[name].name} rate limit exceeded`,
      });
      expect(mocks.limit).toHaveBeenCalledWith('fixture-ip');
      expect(limiter.getConfig()).toEqual(RATE_LIMITERS[name]);
    }
  );

  it.each(names)(
    'denies %s without memory fallback when production Redis fails',
    async name => {
      const {
        handleCheckLimiter,
        publicProfileCaptureDismissalLimiter,
        publicProfilePacEventLimiter,
      } = await import('./public-anonymous-limiters');
      const limiter =
        name === 'handleCheck'
          ? handleCheckLimiter
          : name === 'publicProfileCaptureDismissal'
            ? publicProfileCaptureDismissalLimiter
            : publicProfilePacEventLimiter;
      const memory = vi.spyOn(MemoryRateLimiter.prototype, 'limit');
      mocks.limit.mockRejectedValue(new Error('fixture backend unavailable'));

      expect(await limiter.limit('fixture-ip')).toMatchObject({
        success: false,
        remaining: 0,
        unavailable: true,
        backend: 'unavailable',
      });
      expect(memory).not.toHaveBeenCalled();
      memory.mockRestore();
    }
  );
});
