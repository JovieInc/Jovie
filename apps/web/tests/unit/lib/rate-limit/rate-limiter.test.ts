import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const {
  mockRedisLimiter,
  mockMemoryInstance,
  mockIsRedisAvailable,
  MockMemoryClass,
} = vi.hoisted(() => {
  const mockMemoryInstance = {
    limit: vi.fn(),
    getStatus: vi.fn(),
    reset: vi.fn(),
    getConfig: vi.fn(),
  };

  // Must be a real class so `new MemoryRateLimiter(config)` works
  class MockMemoryClass {
    static mock = { calls: [] as any[], instances: [] as any[] };
    constructor(...args: any[]) {
      MockMemoryClass.mock.calls.push(args);
      MockMemoryClass.mock.instances.push(this);
      return mockMemoryInstance as any;
    }
  }

  return {
    mockRedisLimiter: {
      limit: vi.fn(),
    },
    mockMemoryInstance,
    mockIsRedisAvailable: vi.fn(),
    MockMemoryClass,
  };
});

const mockCreateRedisRateLimiter = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit/redis-limiter', () => ({
  createRedisRateLimiter: mockCreateRedisRateLimiter,
  isRedisAvailable: mockIsRedisAvailable,
}));

vi.mock('@/lib/rate-limit/memory-limiter', () => ({
  MemoryRateLimiter: MockMemoryClass,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: { NODE_ENV: 'test' },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import {
  createRateLimiter,
  isRateLimitingEnabled,
  RateLimiter,
} from '@/lib/rate-limit/rate-limiter';

// ── Helpers ────────────────────────────────────────────────────────────
const baseConfig = {
  name: 'test-limiter',
  limit: 10,
  window: '1m',
  prefix: 'test',
};

// ── Tests ──────────────────────────────────────────────────────────────
describe('rate-limiter.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockMemoryClass.mock.calls = [];
    MockMemoryClass.mock.instances = [];
    // Default: Redis is available (factory returns the mock)
    mockCreateRedisRateLimiter.mockReturnValue(mockRedisLimiter);
    mockIsRedisAvailable.mockReturnValue(true);
  });

  // ── 1. Factory ─────────────────────────────────────────────────────
  describe('createRateLimiter()', () => {
    it('returns a RateLimiter instance', () => {
      const limiter = createRateLimiter(baseConfig);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('passes config and options through to the constructor', () => {
      const logger = vi.fn();
      const limiter = createRateLimiter(baseConfig, {
        preferRedis: false,
        logger,
      });
      expect(limiter.getBackend()).toBe('memory');
    });
  });

  // ── 2. Backend selection ───────────────────────────────────────────
  describe('backend selection', () => {
    it('uses redis backend when Redis is available and preferRedis is true', () => {
      const limiter = new RateLimiter(baseConfig, { preferRedis: true });
      expect(limiter.getBackend()).toBe('redis');
      expect(limiter.isRedisActive()).toBe(true);
    });

    it('uses memory backend when preferRedis is false', () => {
      const limiter = new RateLimiter(baseConfig, { preferRedis: false });
      expect(limiter.getBackend()).toBe('memory');
      expect(limiter.isRedisActive()).toBe(false);
    });

    it('falls back to memory when Redis is unavailable', () => {
      mockCreateRedisRateLimiter.mockReturnValue(null);
      const limiter = new RateLimiter(baseConfig);
      expect(limiter.getBackend()).toBe('memory');
      expect(limiter.isRedisActive()).toBe(false);
    });

    it('logs a warning when Redis is unavailable and warnOnFallback is true', () => {
      mockCreateRedisRateLimiter.mockReturnValue(null);
      const logger = vi.fn();
      new RateLimiter(baseConfig, { warnOnFallback: true, logger });
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Redis unavailable')
      );
    });

    it('does not log when warnOnFallback is false', () => {
      mockCreateRedisRateLimiter.mockReturnValue(null);
      const logger = vi.fn();
      new RateLimiter(baseConfig, { warnOnFallback: false, logger });
      expect(logger).not.toHaveBeenCalled();
    });
  });

  // ── 3. limit() ────────────────────────────────────────────────────
  describe('limit()', () => {
    it('returns success result from Redis when allowed', async () => {
      const resetMs = Date.now() + 60_000;
      mockRedisLimiter.limit.mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: resetMs,
      });

      const limiter = new RateLimiter(baseConfig);
      const result = await limiter.limit('user-1');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
      expect(result.reset).toBeInstanceOf(Date);
      expect(result.reset.getTime()).toBe(resetMs);
      expect(result.reason).toBeUndefined();
    });

    it('returns rate-limited result from Redis when exceeded', async () => {
      mockRedisLimiter.limit.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        reset: Date.now() + 60_000,
      });

      const limiter = new RateLimiter(baseConfig);
      const result = await limiter.limit('user-1');

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toBe('test-limiter rate limit exceeded');
    });

    it('falls back to memory limiter when Redis throws', async () => {
      const logger = vi.fn();
      mockRedisLimiter.limit.mockRejectedValue(new Error('Redis down'));

      const memoryResult = {
        success: true,
        limit: 10,
        remaining: 8,
        reset: new Date(),
      };
      mockMemoryInstance.limit.mockResolvedValue(memoryResult);

      const limiter = new RateLimiter(baseConfig, { logger });
      const result = await limiter.limit('user-1');

      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Redis error')
      );
      expect(result).toEqual(memoryResult);
    });

    it('uses memory limiter directly when Redis is not configured', async () => {
      mockCreateRedisRateLimiter.mockReturnValue(null);
      const memoryResult = {
        success: true,
        limit: 10,
        remaining: 7,
        reset: new Date(),
      };
      mockMemoryInstance.limit.mockResolvedValue(memoryResult);

      const limiter = new RateLimiter(baseConfig, { warnOnFallback: false });
      const result = await limiter.limit('user-1');

      expect(result).toEqual(memoryResult);
      expect(mockRedisLimiter.limit).not.toHaveBeenCalled();
    });
  });

  // ── 4. getStatus() ───────────────────────────────────────────────
  describe('getStatus()', () => {
    it('delegates to memory limiter and returns status', () => {
      const status = {
        limit: 10,
        remaining: 5,
        resetTime: Date.now() + 30_000,
        blocked: false,
        retryAfterSeconds: 0,
      };
      mockMemoryInstance.getStatus.mockReturnValue(status);

      const limiter = new RateLimiter(baseConfig);
      const result = limiter.getStatus('user-1');

      expect(result).toEqual(status);
      expect(mockMemoryInstance.getStatus).toHaveBeenCalledWith('user-1');
    });
  });

  // ── 5. wouldBeRateLimited() ───────────────────────────────────────
  describe('wouldBeRateLimited()', () => {
    it('returns false when not blocked', async () => {
      mockMemoryInstance.getStatus.mockReturnValue({
        limit: 10,
        remaining: 5,
        resetTime: Date.now() + 30_000,
        blocked: false,
        retryAfterSeconds: 0,
      });

      const limiter = new RateLimiter(baseConfig);
      const result = await limiter.wouldBeRateLimited('user-1');
      expect(result).toBe(false);
    });

    it('returns true when blocked', async () => {
      mockMemoryInstance.getStatus.mockReturnValue({
        limit: 10,
        remaining: 0,
        resetTime: Date.now() + 30_000,
        blocked: true,
        retryAfterSeconds: 30,
      });

      const limiter = new RateLimiter(baseConfig);
      const result = await limiter.wouldBeRateLimited('user-1');
      expect(result).toBe(true);
    });
  });

  // ── 6. getBackend() ──────────────────────────────────────────────
  describe('getBackend()', () => {
    it('returns "redis" when Redis limiter is active', () => {
      const limiter = new RateLimiter(baseConfig);
      expect(limiter.getBackend()).toBe('redis');
    });

    it('returns "memory" when Redis limiter is null', () => {
      mockCreateRedisRateLimiter.mockReturnValue(null);
      const limiter = new RateLimiter(baseConfig, { warnOnFallback: false });
      expect(limiter.getBackend()).toBe('memory');
    });
  });

  // ── 7. getConfig() ───────────────────────────────────────────────
  describe('getConfig()', () => {
    it('returns the configuration passed to the constructor', () => {
      const limiter = new RateLimiter(baseConfig);
      expect(limiter.getConfig()).toEqual(baseConfig);
    });

    it('preserves analytics field', () => {
      const configWithAnalytics = { ...baseConfig, analytics: false };
      const limiter = new RateLimiter(configWithAnalytics);
      expect(limiter.getConfig().analytics).toBe(false);
    });
  });

  // ── 8. reset() ───────────────────────────────────────────────────
  describe('reset()', () => {
    it('delegates to memory limiter', () => {
      const limiter = new RateLimiter(baseConfig);
      limiter.reset('user-1');
      expect(mockMemoryInstance.reset).toHaveBeenCalledWith('user-1');
    });
  });

  // ── 9. isRateLimitingEnabled() ────────────────────────────────────
  describe('isRateLimitingEnabled()', () => {
    it('returns true when Redis is available', () => {
      mockIsRedisAvailable.mockReturnValue(true);
      expect(isRateLimitingEnabled()).toBe(true);
    });

    it('returns false when Redis is unavailable', () => {
      mockIsRedisAvailable.mockReturnValue(false);
      expect(isRateLimitingEnabled()).toBe(false);
    });
  });

  // ── 10. Constructor defaults and initialization ────────────────────
  describe('default options', () => {
    it('defaults preferRedis to true', () => {
      const limiter = new RateLimiter(baseConfig);
      expect(mockCreateRedisRateLimiter).toHaveBeenCalledWith(baseConfig);
      expect(limiter.isRedisActive()).toBe(true);
    });

    it('initializes MemoryRateLimiter with the config', () => {
      new RateLimiter(baseConfig);
      expect(MockMemoryClass.mock.calls).toHaveLength(1);
      expect(MockMemoryClass.mock.calls[0][0]).toEqual(baseConfig);
    });

    it('does not call createRedisRateLimiter when preferRedis is false', () => {
      mockCreateRedisRateLimiter.mockClear();
      new RateLimiter(baseConfig, { preferRedis: false });
      expect(mockCreateRedisRateLimiter).not.toHaveBeenCalled();
    });
  });
});
