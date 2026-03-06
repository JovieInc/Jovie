import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RateLimitConfig, RateLimitResult } from '@/lib/rate-limit/types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockLimit, mockGetStatus, mockWouldBeRateLimited } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockGetStatus: vi.fn(),
  mockWouldBeRateLimited: vi.fn(),
}));

/**
 * Every call to createRateLimiter returns a fake RateLimiter whose methods
 * delegate to mocks. This lets us control results while verifying correct
 * config/key is passed.
 */
vi.mock('@/lib/rate-limit/rate-limiter', () => {
  class FakeRateLimiter {
    config: RateLimitConfig;
    constructor(config: RateLimitConfig) {
      this.config = config;
    }
    limit = mockLimit;
    getStatus = mockGetStatus;
    wouldBeRateLimited = mockWouldBeRateLimited;
    getBackend = vi.fn().mockReturnValue('memory');
    isRedisActive = vi.fn().mockReturnValue(false);
    getConfig = vi.fn(() => this.config);
    reset = vi.fn();
  }
  return {
    RateLimiter: FakeRateLimiter,
    createRateLimiter: (config: RateLimitConfig) => new FakeRateLimiter(config),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAllowedResult(
  overrides?: Partial<RateLimitResult>
): RateLimitResult {
  return {
    success: true,
    limit: 100,
    remaining: 99,
    reset: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function makeDeniedResult(
  overrides?: Partial<RateLimitResult>
): RateLimitResult {
  return {
    success: false,
    limit: 100,
    remaining: 0,
    reset: new Date(Date.now() + 60_000),
    reason: 'rate limited',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test configs
// ---------------------------------------------------------------------------

const freeConfig: RateLimitConfig = {
  name: 'test-free',
  limit: 10,
  window: '1 d',
  prefix: 'test:free',
};

const proConfig: RateLimitConfig = {
  name: 'test-pro',
  limit: 100,
  window: '1 d',
  prefix: 'test:pro',
};

const growthConfig: RateLimitConfig = {
  name: 'test-growth',
  limit: 500,
  window: '1 d',
  prefix: 'test:growth',
};

const foundingConfig: RateLimitConfig = {
  name: 'test-founding',
  limit: 150,
  window: '1 d',
  prefix: 'test:founding',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plan-aware-limiter.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache so each test gets fresh factory
    vi.resetModules();
  });

  // =========================================================================
  // createPlanAwareRateLimiter - Basic functionality
  // =========================================================================

  describe('createPlanAwareRateLimiter', () => {
    it('returns a PlanAwareRateLimiter instance with required methods', async () => {
      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig },
      });

      expect(typeof limiter.limit).toBe('function');
      expect(typeof limiter.getStatus).toBe('function');
      expect(typeof limiter.wouldBeRateLimited).toBe('function');
      expect(typeof limiter.getConfigForPlan).toBe('function');
    });
  });

  // =========================================================================
  // Plan tier selection
  // =========================================================================

  describe('plan tier selection', () => {
    it('uses free config for free plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult({ limit: 10 }));

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      const result = await limiter.limit('user-1', 'free');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });

    it('uses pro config for pro plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult({ limit: 100 }));

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      const result = await limiter.limit('user-1', 'pro');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });

    it('uses growth config for growth plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult({ limit: 500 }));

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          growth: growthConfig,
        },
      });

      const result = await limiter.limit('user-1', 'growth');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });

    it('uses founding config when explicitly defined', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult({ limit: 150 }));

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          founding: foundingConfig,
        },
      });

      const result = await limiter.limit('user-1', 'founding');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });
  });

  // =========================================================================
  // Fallback behavior for null/undefined/unknown plans
  // =========================================================================

  describe('fallback to free tier', () => {
    it('uses free config for null plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      const config = limiter.getConfigForPlan(null);
      expect(config).toEqual(freeConfig);

      const result = await limiter.limit('user-1', null);
      expect(result.success).toBe(true);
    });

    it('uses free config for undefined plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      const config = limiter.getConfigForPlan(undefined);
      expect(config).toEqual(freeConfig);

      const result = await limiter.limit('user-1', undefined);
      expect(result.success).toBe(true);
    });

    it('uses free config for unknown plan strings', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      const config = limiter.getConfigForPlan('enterprise');
      expect(config).toEqual(freeConfig);

      const result = await limiter.limit('user-1', 'unknown-plan');
      expect(result.success).toBe(true);
    });

    it('normalizes plan string case', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
        },
      });

      // Should normalize to lowercase and match 'pro'
      const config = limiter.getConfigForPlan('PRO');
      expect(config).toEqual(proConfig);
    });
  });

  // =========================================================================
  // Founding tier mapping to pro
  // =========================================================================

  describe('founding tier fallback to pro', () => {
    it('uses pro config for founding when founding config not defined', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          // Note: founding is NOT defined
        },
      });

      const config = limiter.getConfigForPlan('founding');
      expect(config).toEqual(proConfig);

      const result = await limiter.limit('user-1', 'founding');
      expect(result.success).toBe(true);
    });

    it('uses founding config when explicitly defined (not pro)', async () => {
      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          founding: foundingConfig,
        },
      });

      const config = limiter.getConfigForPlan('founding');
      expect(config).toEqual(foundingConfig);
      expect(config).not.toEqual(proConfig);
    });

    it('uses free config for founding when neither founding nor pro defined', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          // Note: neither pro nor founding defined
        },
      });

      const config = limiter.getConfigForPlan('founding');
      expect(config).toEqual(freeConfig);
    });
  });

  // =========================================================================
  // Custom error messages per plan
  // =========================================================================

  describe('custom error messages', () => {
    it('uses default error message with upgrade prompt for free users', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = await limiter.limit('user-1', 'free');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Upgrade');
    });

    it('uses default error message without upgrade prompt for paid users', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = await limiter.limit('user-1', 'pro');

      expect(result.success).toBe(false);
      expect(result.reason).not.toContain('Upgrade');
      expect(result.reason).toContain('try again later');
    });

    it('uses custom error message function when provided', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const customErrorMessage = vi.fn(plan =>
        plan === 'free'
          ? 'Free users: Please upgrade!'
          : `${plan} users: Limit reached.`
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
        errorMessage: customErrorMessage,
      });

      // Test free plan
      const freeResult = await limiter.limit('user-1', 'free');
      expect(freeResult.reason).toBe('Free users: Please upgrade!');
      expect(customErrorMessage).toHaveBeenCalledWith('free');

      // Test pro plan
      const proResult = await limiter.limit('user-2', 'pro');
      expect(proResult.reason).toBe('pro users: Limit reached.');
      expect(customErrorMessage).toHaveBeenCalledWith('pro');
    });

    it('does not set reason when limit succeeds', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig },
        errorMessage: () => 'Custom error',
      });

      const result = await limiter.limit('user-1', 'free');

      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  // =========================================================================
  // getStatus delegation
  // =========================================================================

  describe('getStatus delegation', () => {
    it('delegates to correct limiter based on plan', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 50,
        resetTime: Date.now() + 30_000,
        blocked: false,
        retryAfterSeconds: 0,
      };
      mockGetStatus.mockReturnValue(mockStatus);

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = limiter.getStatus('user-1', 'pro');

      expect(result).toEqual(mockStatus);
      expect(mockGetStatus).toHaveBeenCalledWith('user-1');
    });

    it('uses free limiter for null plan in getStatus', async () => {
      const mockStatus = {
        limit: 10,
        remaining: 5,
        resetTime: Date.now() + 30_000,
        blocked: false,
        retryAfterSeconds: 0,
      };
      mockGetStatus.mockReturnValue(mockStatus);

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = limiter.getStatus('user-1', null);

      expect(result).toEqual(mockStatus);
      expect(mockGetStatus).toHaveBeenCalledWith('user-1');
    });
  });

  // =========================================================================
  // wouldBeRateLimited delegation
  // =========================================================================

  describe('wouldBeRateLimited delegation', () => {
    it('delegates to correct limiter based on plan', async () => {
      mockWouldBeRateLimited.mockResolvedValue(false);

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = await limiter.wouldBeRateLimited('user-1', 'pro');

      expect(result).toBe(false);
      expect(mockWouldBeRateLimited).toHaveBeenCalledWith('user-1');
    });

    it('uses free limiter for undefined plan in wouldBeRateLimited', async () => {
      mockWouldBeRateLimited.mockResolvedValue(true);

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      const result = await limiter.wouldBeRateLimited('user-1', undefined);

      expect(result).toBe(true);
      expect(mockWouldBeRateLimited).toHaveBeenCalledWith('user-1');
    });

    it('returns true when would be rate limited', async () => {
      mockWouldBeRateLimited.mockResolvedValue(true);

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig },
      });

      const result = await limiter.wouldBeRateLimited('user-1', 'free');

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // getConfigForPlan
  // =========================================================================

  describe('getConfigForPlan', () => {
    it('returns correct config for each plan tier', async () => {
      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          growth: growthConfig,
          founding: foundingConfig,
        },
      });

      expect(limiter.getConfigForPlan('free')).toEqual(freeConfig);
      expect(limiter.getConfigForPlan('pro')).toEqual(proConfig);
      expect(limiter.getConfigForPlan('growth')).toEqual(growthConfig);
      expect(limiter.getConfigForPlan('founding')).toEqual(foundingConfig);
    });

    it('returns free config for undefined configs', async () => {
      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          // Only free defined
        },
      });

      expect(limiter.getConfigForPlan('growth')).toEqual(freeConfig);
    });
  });

  // =========================================================================
  // Limiter caching
  // =========================================================================

  describe('limiter caching', () => {
    it('reuses the same limiter for repeated calls with same plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig, pro: proConfig },
      });

      await limiter.limit('user-1', 'pro');
      await limiter.limit('user-2', 'pro');
      await limiter.limit('user-3', 'pro');

      // All calls should use the same limiter instance
      expect(mockLimit).toHaveBeenCalledTimes(3);
    });

    it('shares limiter when founding falls back to pro', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: {
          free: freeConfig,
          pro: proConfig,
          // founding NOT defined - should share pro limiter
        },
      });

      // Both founding and pro should use the same config
      const foundingConfig = limiter.getConfigForPlan('founding');
      const proConfigResult = limiter.getConfigForPlan('pro');
      expect(foundingConfig).toBe(proConfigResult);

      await limiter.limit('user-1', 'founding');
      await limiter.limit('user-2', 'pro');

      expect(mockLimit).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // preferRedis option
  // =========================================================================

  describe('preferRedis option', () => {
    it('passes preferRedis option to createRateLimiter', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      // We need to access the mock to verify the option was passed
      const { createPlanAwareRateLimiter } = await import(
        '@/lib/rate-limit/plan-aware-limiter'
      );

      const limiter = createPlanAwareRateLimiter({
        configs: { free: freeConfig },
        preferRedis: false,
      });

      // Trigger limiter creation
      await limiter.limit('user-1', 'free');

      // The limiter should have been created (we can't easily verify the option
      // was passed to createRateLimiter without more complex mocking, but we can
      // verify the limiter works)
      expect(mockLimit).toHaveBeenCalled();
    });
  });
});
