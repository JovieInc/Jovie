/**
 * Rate Limit Configuration Tests
 *
 * Tests for parseWindowToMs and RATE_LIMITERS configuration.
 */

import { describe, expect, it } from 'vitest';
import { parseWindowToMs, RATE_LIMITERS } from '@/lib/rate-limit/config';

describe('Rate Limit Config', () => {
  describe('parseWindowToMs', () => {
    describe('seconds', () => {
      it('should parse 1 second', () => {
        expect(parseWindowToMs('1 s')).toBe(1000);
      });

      it('should parse multiple seconds', () => {
        expect(parseWindowToMs('30 s')).toBe(30000);
      });

      it('should parse seconds without space', () => {
        expect(parseWindowToMs('5s')).toBe(5000);
      });
    });

    describe('minutes', () => {
      it('should parse 1 minute', () => {
        expect(parseWindowToMs('1 m')).toBe(60000);
      });

      it('should parse multiple minutes', () => {
        expect(parseWindowToMs('5 m')).toBe(300000);
      });

      it('should parse minutes without space', () => {
        expect(parseWindowToMs('10m')).toBe(600000);
      });
    });

    describe('hours', () => {
      it('should parse 1 hour', () => {
        expect(parseWindowToMs('1 h')).toBe(3600000);
      });

      it('should parse multiple hours', () => {
        expect(parseWindowToMs('24 h')).toBe(86400000);
      });

      it('should parse hours without space', () => {
        expect(parseWindowToMs('2h')).toBe(7200000);
      });
    });

    describe('days', () => {
      it('should parse 1 day', () => {
        expect(parseWindowToMs('1 d')).toBe(86400000);
      });

      it('should parse multiple days', () => {
        expect(parseWindowToMs('7 d')).toBe(604800000);
      });

      it('should parse days without space', () => {
        expect(parseWindowToMs('30d')).toBe(2592000000);
      });
    });

    describe('error handling', () => {
      it('should throw for invalid format', () => {
        expect(() => parseWindowToMs('invalid')).toThrow(
          'Invalid window format'
        );
      });

      it('should throw for missing unit', () => {
        expect(() => parseWindowToMs('100')).toThrow('Invalid window format');
      });

      it('should throw for invalid unit', () => {
        expect(() => parseWindowToMs('10 x')).toThrow('Invalid window format');
      });

      it('should throw for empty string', () => {
        expect(() => parseWindowToMs('')).toThrow('Invalid window format');
      });

      it('should throw for negative values', () => {
        expect(() => parseWindowToMs('-1 m')).toThrow('Invalid window format');
      });
    });
  });

  describe('RATE_LIMITERS configuration', () => {
    describe('structure', () => {
      it('should have all required limiters defined', () => {
        const requiredLimiters = [
          'avatarUpload',
          'api',
          'onboarding',
          'handleCheck',
          'dashboardLinks',
          'paymentIntent',
          'adminImpersonate',
          'trackingClicks',
          'trackingVisits',
          'publicProfile',
          'health',
          'general',
          'spotifySearch',
          'spotifyClaim',
          'aiChat',
        ];

        for (const limiter of requiredLimiters) {
          expect(RATE_LIMITERS).toHaveProperty(limiter);
        }
      });

      it('should have valid config for each limiter', () => {
        for (const [_name, config] of Object.entries(RATE_LIMITERS)) {
          expect(config.name).toBeTruthy();
          expect(config.limit).toBeGreaterThan(0);
          expect(config.window).toBeTruthy();
          expect(config.prefix).toBeTruthy();
          // Verify window is parseable
          expect(() => parseWindowToMs(config.window)).not.toThrow();
        }
      });
    });

    describe('security-critical limiters', () => {
      it('should have strict onboarding limits', () => {
        expect(RATE_LIMITERS.onboarding.limit).toBeLessThanOrEqual(5);
        expect(RATE_LIMITERS.onboarding.window).toContain('h');
      });

      it('should have strict admin impersonation limits', () => {
        expect(RATE_LIMITERS.adminImpersonate.limit).toBeLessThanOrEqual(10);
        expect(RATE_LIMITERS.adminImpersonate.window).toContain('h');
      });

      it('should have strict payment intent limits', () => {
        expect(RATE_LIMITERS.paymentIntent.limit).toBeLessThanOrEqual(20);
        expect(RATE_LIMITERS.paymentIntent.window).toContain('h');
      });

      it('should have strict Spotify claim limits', () => {
        expect(RATE_LIMITERS.spotifyClaim.limit).toBeLessThanOrEqual(10);
        expect(RATE_LIMITERS.spotifyClaim.window).toContain('h');
      });
    });

    describe('analytics configuration', () => {
      it('should enable analytics for critical operations', () => {
        expect(RATE_LIMITERS.onboarding.analytics).toBe(true);
        expect(RATE_LIMITERS.paymentIntent.analytics).toBe(true);
        expect(RATE_LIMITERS.adminImpersonate.analytics).toBe(true);
      });

      it('should disable analytics for high-volume public endpoints', () => {
        expect(RATE_LIMITERS.publicProfile.analytics).toBe(false);
        expect(RATE_LIMITERS.publicClick.analytics).toBe(false);
        expect(RATE_LIMITERS.health.analytics).toBe(false);
      });
    });

    describe('prefix uniqueness', () => {
      it('should have unique prefixes for all limiters', () => {
        const prefixes = Object.values(RATE_LIMITERS).map(c => c.prefix);
        const uniquePrefixes = new Set(prefixes);
        expect(uniquePrefixes.size).toBe(prefixes.length);
      });
    });
  });
});
