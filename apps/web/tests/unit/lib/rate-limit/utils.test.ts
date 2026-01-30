/**
 * Rate Limit Utilities Tests
 *
 * Tests for IP extraction, header generation, and formatting utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimitResult, RateLimitStatus } from '@/lib/rate-limit/types';
import {
  createRateLimitHeaders,
  createRateLimitHeadersFromStatus,
  createRateLimitKey,
  formatTimeRemaining,
  getClientIP,
} from '@/lib/rate-limit/utils';

describe('Rate Limit Utils', () => {
  describe('getClientIP', () => {
    function createMockRequest(headers: Record<string, string>): Request {
      return {
        headers: new Headers(headers),
      } as Request;
    }

    it('should extract IP from cf-connecting-ip (Cloudflare)', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '203.0.113.50',
      });
      expect(getClientIP(request)).toBe('203.0.113.50');
    });

    it('should extract IP from true-client-ip (Cloudflare Enterprise)', () => {
      const request = createMockRequest({
        'true-client-ip': '203.0.113.51',
      });
      expect(getClientIP(request)).toBe('203.0.113.51');
    });

    it('should extract IP from x-real-ip (nginx)', () => {
      const request = createMockRequest({
        'x-real-ip': '203.0.113.52',
      });
      expect(getClientIP(request)).toBe('203.0.113.52');
    });

    it('should extract first IP from x-forwarded-for chain', () => {
      const request = createMockRequest({
        'x-forwarded-for': '203.0.113.53, 10.0.0.1, 10.0.0.2',
      });
      expect(getClientIP(request)).toBe('203.0.113.53');
    });

    it('should handle single IP in x-forwarded-for', () => {
      const request = createMockRequest({
        'x-forwarded-for': '203.0.113.54',
      });
      expect(getClientIP(request)).toBe('203.0.113.54');
    });

    it('should extract IP from x-client-ip', () => {
      const request = createMockRequest({
        'x-client-ip': '203.0.113.55',
      });
      expect(getClientIP(request)).toBe('203.0.113.55');
    });

    it('should prioritize cf-connecting-ip over other headers', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '203.0.113.1',
        'true-client-ip': '203.0.113.2',
        'x-real-ip': '203.0.113.3',
        'x-forwarded-for': '203.0.113.4',
      });
      expect(getClientIP(request)).toBe('203.0.113.1');
    });

    it('should fall back to x-real-ip when Cloudflare headers missing', () => {
      const request = createMockRequest({
        'x-real-ip': '203.0.113.3',
        'x-forwarded-for': '203.0.113.4',
      });
      expect(getClientIP(request)).toBe('203.0.113.3');
    });

    it('should trim whitespace from IP addresses', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '  203.0.113.50  ',
      });
      expect(getClientIP(request)).toBe('203.0.113.50');
    });

    it('should trim whitespace from x-forwarded-for chain', () => {
      const request = createMockRequest({
        'x-forwarded-for': '  203.0.113.53  ,  10.0.0.1  ',
      });
      expect(getClientIP(request)).toBe('203.0.113.53');
    });

    it('should return fallback for development when no headers', () => {
      const request = createMockRequest({});
      expect(getClientIP(request)).toBe('127.0.0.1');
    });

    it('should handle IPv6 addresses', () => {
      const request = createMockRequest({
        'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      });
      expect(getClientIP(request)).toBe(
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
      );
    });
  });

  describe('createRateLimitHeaders', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create headers for successful result', () => {
      const resetDate = new Date('2025-01-01T12:01:00Z');
      const result: RateLimitResult = {
        success: true,
        limit: 100,
        remaining: 95,
        reset: resetDate,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('95');
      // Verify reset is the unix timestamp of the reset date
      expect(headers['X-RateLimit-Reset']).toBe(
        String(Math.floor(resetDate.getTime() / 1000))
      );
      expect(headers['Retry-After']).toBeUndefined();
    });

    it('should include Retry-After header when rate limited', () => {
      const result: RateLimitResult = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: new Date('2025-01-01T12:01:00Z'),
        reason: 'Rate limit exceeded',
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('0');
      expect(headers['Retry-After']).toBe('60');
    });

    it('should handle reset time in the past', () => {
      const result: RateLimitResult = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: new Date('2025-01-01T11:59:00Z'), // 1 minute ago
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['Retry-After']).toBe('0');
    });
  });

  describe('createRateLimitHeadersFromStatus', () => {
    it('should create headers from status object', () => {
      const status: RateLimitStatus = {
        limit: 50,
        remaining: 25,
        resetTime: 1735733260000, // 2025-01-01T12:01:00Z in ms
        blocked: false,
        retryAfterSeconds: 0,
      };

      const headers = createRateLimitHeadersFromStatus(status);

      expect(headers['X-RateLimit-Limit']).toBe('50');
      expect(headers['X-RateLimit-Remaining']).toBe('25');
      expect(headers['X-RateLimit-Reset']).toBe('1735733260');
      expect(headers['Retry-After']).toBeUndefined();
    });

    it('should include Retry-After when blocked', () => {
      const status: RateLimitStatus = {
        limit: 50,
        remaining: 0,
        resetTime: 1735733260000,
        blocked: true,
        retryAfterSeconds: 45,
      };

      const headers = createRateLimitHeadersFromStatus(status);

      expect(headers['Retry-After']).toBe('45');
    });
  });

  describe('createRateLimitKey', () => {
    it('should create key with prefix and identifier', () => {
      const key = createRateLimitKey('api', 'user-123');
      expect(key).toBe('api:user-123');
    });

    it('should create key with type for user', () => {
      const key = createRateLimitKey('api', 'user-123', 'user');
      expect(key).toBe('api:user:user-123');
    });

    it('should create key with type for ip', () => {
      const key = createRateLimitKey('api', '192.168.1.1', 'ip');
      expect(key).toBe('api:ip:192.168.1.1');
    });

    it('should create key with type for creator', () => {
      const key = createRateLimitKey('tracking', 'creator-456', 'creator');
      expect(key).toBe('tracking:creator:creator-456');
    });

    it('should handle special characters in identifier', () => {
      const key = createRateLimitKey('email', 'user@example.com', 'user');
      expect(key).toBe('email:user:user@example.com');
    });
  });

  describe('formatTimeRemaining', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('with Date object', () => {
      it('should format seconds remaining', () => {
        const reset = new Date('2025-01-01T12:00:30Z');
        expect(formatTimeRemaining(reset)).toBe('30 seconds');
      });

      it('should format single second', () => {
        const reset = new Date('2025-01-01T12:00:01Z');
        expect(formatTimeRemaining(reset)).toBe('1 second');
      });

      it('should format minutes remaining', () => {
        const reset = new Date('2025-01-01T12:05:00Z');
        expect(formatTimeRemaining(reset)).toBe('5 minutes');
      });

      it('should format single minute', () => {
        const reset = new Date('2025-01-01T12:01:00Z');
        expect(formatTimeRemaining(reset)).toBe('1 minute');
      });

      it('should format hours remaining', () => {
        const reset = new Date('2025-01-01T14:00:00Z');
        expect(formatTimeRemaining(reset)).toBe('2 hours');
      });

      it('should format single hour', () => {
        const reset = new Date('2025-01-01T13:00:00Z');
        expect(formatTimeRemaining(reset)).toBe('1 hour');
      });

      it('should return "now" for past time', () => {
        const reset = new Date('2025-01-01T11:59:00Z');
        expect(formatTimeRemaining(reset)).toBe('now');
      });

      it('should return "now" for current time', () => {
        const reset = new Date('2025-01-01T12:00:00Z');
        expect(formatTimeRemaining(reset)).toBe('now');
      });
    });

    describe('with timestamp number', () => {
      it('should format seconds remaining from timestamp', () => {
        const reset = new Date('2025-01-01T12:00:45Z').getTime();
        expect(formatTimeRemaining(reset)).toBe('45 seconds');
      });

      it('should format minutes remaining from timestamp', () => {
        const reset = new Date('2025-01-01T12:10:00Z').getTime();
        expect(formatTimeRemaining(reset)).toBe('10 minutes');
      });

      it('should format hours remaining from timestamp', () => {
        const reset = new Date('2025-01-01T15:00:00Z').getTime();
        expect(formatTimeRemaining(reset)).toBe('3 hours');
      });
    });

    describe('boundary conditions', () => {
      it('should show seconds for 59 seconds', () => {
        const reset = new Date('2025-01-01T12:00:59Z');
        expect(formatTimeRemaining(reset)).toBe('59 seconds');
      });

      it('should show 1 minute for 60 seconds', () => {
        const reset = new Date('2025-01-01T12:01:00Z');
        expect(formatTimeRemaining(reset)).toBe('1 minute');
      });

      it('should show minutes for 59 minutes', () => {
        const reset = new Date('2025-01-01T12:59:00Z');
        expect(formatTimeRemaining(reset)).toBe('59 minutes');
      });

      it('should show 1 hour for 60 minutes', () => {
        const reset = new Date('2025-01-01T13:00:00Z');
        expect(formatTimeRemaining(reset)).toBe('1 hour');
      });
    });
  });
});
