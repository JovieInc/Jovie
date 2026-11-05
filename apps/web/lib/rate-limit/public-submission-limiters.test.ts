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

import { RATE_LIMITERS } from './config';
import { MemoryRateLimiter } from './memory-limiter';
import { PUBLIC_SUBMISSION_RATE_LIMITERS } from './public-submission-config';
import { resetRedisCircuitBreaker } from './rate-limiter';

const names = ['changelogSubscribe', 'waitlistJoin'] as const;

beforeEach(() => {
  mocks.limit.mockReset();
  mocks.create.mockReturnValue({ limit: mocks.limit });
  resetRedisCircuitBreaker();
});

describe('public submission limiters', () => {
  it('preserves public exports and administrative census singleton identity', async () => {
    const instances = await import('./public-submission-limiters');
    const central = await import('./limiters');
    const publicApi = await import('./index');
    expect(central.changelogSubscribeLimiter).toBe(
      instances.changelogSubscribeLimiter
    );
    expect(central.waitlistJoinLimiter).toBe(instances.waitlistJoinLimiter);
    expect(publicApi.waitlistJoinLimiter).toBe(instances.waitlistJoinLimiter);
    expect(central.getAllLimiters().changelogSubscribe).toBe(
      instances.changelogSubscribeLimiter
    );
    expect(central.getAllLimiters().waitlistJoin).toBe(
      instances.waitlistJoinLimiter
    );
  });
  it.each(names)(
    'keeps %s on its canonical one-per-ten-seconds durable policy',
    name => {
      expect(RATE_LIMITERS[name]).toBe(PUBLIC_SUBMISSION_RATE_LIMITERS[name]);
      expect(RATE_LIMITERS[name]).toMatchObject({
        limit: 1,
        window: '10 s',
        algorithm: 'fixed-window',
        trafficClass: 'anonymous',
        requireRedis: true,
        analytics: false,
      });
    }
  );
  it.each(names)(
    'preserves allowed and throttled Redis outcomes for %s',
    async name => {
      const { changelogSubscribeLimiter, waitlistJoinLimiter } = await import(
        './public-submission-limiters'
      );
      const limiter =
        name === 'waitlistJoin'
          ? waitlistJoinLimiter
          : changelogSubscribeLimiter;
      const reset = Date.now() + 10000;
      mocks.limit
        .mockResolvedValueOnce({ success: true, limit: 1, remaining: 0, reset })
        .mockResolvedValueOnce({
          success: false,
          limit: 1,
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
      const { changelogSubscribeLimiter, waitlistJoinLimiter } = await import(
        './public-submission-limiters'
      );
      const limiter =
        name === 'waitlistJoin'
          ? waitlistJoinLimiter
          : changelogSubscribeLimiter;
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
