/**
 * Memory Rate Limiter Tests
 *
 * Tests for the in-memory rate limiter implementation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStore,
  forceCleanup,
  getStoreSize,
  MemoryRateLimiter,
} from '@/lib/rate-limit/memory-limiter';
import type { RateLimitConfig } from '@/lib/rate-limit/types';

describe('MemoryRateLimiter', () => {
  const testConfig: RateLimitConfig = {
    name: 'Test Limiter',
    limit: 3,
    window: '1 m',
    prefix: 'test',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    clearStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStore();
  });

  describe('limit()', () => {
    it('should allow first request', async () => {
      const limiter = new MemoryRateLimiter(testConfig);
      const result = await limiter.limit('user-1');

      expect(result.success).toBe(true);
      expect(result.limit).toBe(3);
      expect(result.remaining).toBe(2);
    });

    it('should decrement remaining count on each request', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      const result1 = await limiter.limit('user-1');
      expect(result1.remaining).toBe(2);

      const result2 = await limiter.limit('user-1');
      expect(result2.remaining).toBe(1);

      const result3 = await limiter.limit('user-1');
      expect(result3.remaining).toBe(0);
    });

    it('should block requests after limit exceeded', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      // Exhaust the limit
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');

      // Fourth request should fail
      const result = await limiter.limit('user-1');
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('rate limit exceeded');
    });

    it('should track different identifiers separately', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      // Exhaust user-1's limit
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');

      // user-2 should still have their limit
      const result = await limiter.limit('user-2');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should reset after window expires', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      // Exhaust the limit
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      const blockedResult = await limiter.limit('user-1');
      expect(blockedResult.success).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(61000); // 61 seconds

      // Should be allowed again
      const result = await limiter.limit('user-1');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should return correct reset time', async () => {
      const limiter = new MemoryRateLimiter(testConfig);
      const result = await limiter.limit('user-1');

      const expectedReset = new Date('2025-01-01T12:01:00Z');
      expect(result.reset.getTime()).toBe(expectedReset.getTime());
    });

    it('should include limiter name in reason when blocked', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      const result = await limiter.limit('user-1');

      expect(result.reason).toBe('Test Limiter rate limit exceeded');
    });
  });

  describe('getStatus()', () => {
    it('should return full limit for new identifiers', () => {
      const limiter = new MemoryRateLimiter(testConfig);
      const status = limiter.getStatus('new-user');

      expect(status.limit).toBe(3);
      expect(status.remaining).toBe(3);
      expect(status.blocked).toBe(false);
      expect(status.retryAfterSeconds).toBe(0);
    });

    it('should return current remaining count', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-1');

      const status = limiter.getStatus('user-1');
      expect(status.remaining).toBe(1);
      expect(status.blocked).toBe(false);
    });

    it('should show blocked status when limit exceeded', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');

      const status = limiter.getStatus('user-1');
      expect(status.remaining).toBe(0);
      expect(status.blocked).toBe(true);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should not increment counter (read-only)', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1'); // 2 remaining

      // Multiple status checks shouldn't affect count
      limiter.getStatus('user-1');
      limiter.getStatus('user-1');
      limiter.getStatus('user-1');

      const result = await limiter.limit('user-1'); // Should be 1 remaining now
      expect(result.remaining).toBe(1);
    });

    it('should return reset status after window expires', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');

      // Advance past window
      vi.advanceTimersByTime(61000);

      const status = limiter.getStatus('user-1');
      expect(status.remaining).toBe(3);
      expect(status.blocked).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear rate limit for identifier', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      // Exhaust limit
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      await limiter.limit('user-1');
      expect((await limiter.limit('user-1')).success).toBe(false);

      // Reset
      limiter.reset('user-1');

      // Should be allowed again
      const result = await limiter.limit('user-1');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should not affect other identifiers', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-2');

      limiter.reset('user-1');

      // user-2 should still have their count
      const status = limiter.getStatus('user-2');
      expect(status.remaining).toBe(2);
    });
  });

  describe('getConfig()', () => {
    it('should return the configuration', () => {
      const limiter = new MemoryRateLimiter(testConfig);
      const config = limiter.getConfig();

      expect(config.name).toBe('Test Limiter');
      expect(config.limit).toBe(3);
      expect(config.window).toBe('1 m');
      expect(config.prefix).toBe('test');
    });
  });

  describe('store management', () => {
    it('should track store size', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      expect(getStoreSize()).toBe(0);

      await limiter.limit('user-1');
      expect(getStoreSize()).toBe(1);

      await limiter.limit('user-2');
      expect(getStoreSize()).toBe(2);
    });

    it('should clear all entries with clearStore', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-2');
      await limiter.limit('user-3');

      expect(getStoreSize()).toBe(3);

      clearStore();

      expect(getStoreSize()).toBe(0);
    });

    it('should clean up expired entries with forceCleanup', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      await limiter.limit('user-1');
      await limiter.limit('user-2');

      expect(getStoreSize()).toBe(2);

      // Advance time past window
      vi.advanceTimersByTime(61000);

      // Add one more that's not expired
      await limiter.limit('user-3');

      forceCleanup();

      // Only the non-expired entry should remain
      expect(getStoreSize()).toBe(1);
    });
  });

  describe('different window sizes', () => {
    it('should handle second-based windows', async () => {
      const config: RateLimitConfig = {
        name: 'Seconds Test',
        limit: 2,
        window: '5 s',
        prefix: 'sec-test',
      };
      const limiter = new MemoryRateLimiter(config);

      await limiter.limit('user-1');
      await limiter.limit('user-1');
      expect((await limiter.limit('user-1')).success).toBe(false);

      // Wait 5 seconds
      vi.advanceTimersByTime(5001);

      expect((await limiter.limit('user-1')).success).toBe(true);
    });

    it('should handle hour-based windows', async () => {
      const config: RateLimitConfig = {
        name: 'Hours Test',
        limit: 2,
        window: '1 h',
        prefix: 'hour-test',
      };
      const limiter = new MemoryRateLimiter(config);

      await limiter.limit('user-1');
      await limiter.limit('user-1');
      expect((await limiter.limit('user-1')).success).toBe(false);

      // 59 minutes - still blocked
      vi.advanceTimersByTime(59 * 60 * 1000);
      expect((await limiter.limit('user-1')).success).toBe(false);

      // 2 more minutes - should be allowed
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect((await limiter.limit('user-1')).success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle limit of 1', async () => {
      const config: RateLimitConfig = {
        name: 'Single',
        limit: 1,
        window: '1 m',
        prefix: 'single',
      };
      const limiter = new MemoryRateLimiter(config);

      const first = await limiter.limit('user-1');
      expect(first.success).toBe(true);
      expect(first.remaining).toBe(0);

      const second = await limiter.limit('user-1');
      expect(second.success).toBe(false);
    });

    it('should handle very high limits', async () => {
      const config: RateLimitConfig = {
        name: 'High',
        limit: 10000,
        window: '1 h',
        prefix: 'high',
      };
      const limiter = new MemoryRateLimiter(config);

      const result = await limiter.limit('user-1');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9999);
    });

    it('should handle special characters in identifiers', async () => {
      const limiter = new MemoryRateLimiter(testConfig);

      const result1 = await limiter.limit('user@example.com');
      expect(result1.success).toBe(true);

      const result2 = await limiter.limit('192.168.1.1');
      expect(result2.success).toBe(true);

      const result3 = await limiter.limit('user:with:colons');
      expect(result3.success).toBe(true);
    });
  });
});
