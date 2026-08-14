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
          'navigationTelemetry',
          'onboarding',
          'handleCheck',
          'dashboardLinks',
          'paymentIntent',
          'adminImpersonate',
          'trackingClicks',
          'trackingVisits',
          'publicProfile',
          'publicProfileCaptureDismissal',
          'publicProfilePacEvent',
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

      it('should bound authenticated header search fanout', () => {
        expect(RATE_LIMITERS.headerSearch.limit).toBe(60);
        expect(RATE_LIMITERS.headerSearch.window).toBe('1 m');
        expect(RATE_LIMITERS.headerSearch.prefix).toBe('header_search');
      });

      it('should have strict Spotify claim limits', () => {
        expect(RATE_LIMITERS.spotifyClaim.limit).toBeLessThanOrEqual(10);
        expect(RATE_LIMITERS.spotifyClaim.window).toContain('h');
      });

      it('should throttle the public claim-token entry route per IP', () => {
        // The unauthenticated /claim/[token] route runs several DB reads plus
        // lead/cookie writes per hit — the throttle must not be silently dropped.
        expect(RATE_LIMITERS.claimTokenAccess).toBeDefined();
        expect(RATE_LIMITERS.claimTokenAccess.limit).toBe(20);
        expect(RATE_LIMITERS.claimTokenAccess.window).toBe('1 m');
        expect(RATE_LIMITERS.claimTokenAccess.prefix).toBe(
          'public:claim-token'
        );
      });

      it('isolates public profile traffic while preserving the aggregate abuse budget', () => {
        const capture = RATE_LIMITERS.publicProfileCaptureDismissal;
        const pac = RATE_LIMITERS.publicProfilePacEvent;

        expect(capture.limit).toBe(20);
        expect(capture.window).toBe(RATE_LIMITERS.general.window);
        expect(capture.prefix).toBe('public:profile:capture-dismissal');
        expect(pac.limit).toBe(40);
        expect(pac.window).toBe(RATE_LIMITERS.general.window);
        expect(pac.prefix).toBe('public:profile:pac-event');
        expect(capture.prefix).not.toBe(pac.prefix);
        expect(capture.limit + pac.limit).toBe(RATE_LIMITERS.general.limit);
      });
    });

    describe('analytics configuration', () => {
      it('should enable analytics for critical operations', () => {
        expect(RATE_LIMITERS.paymentIntent.analytics).toBe(true);
        expect(RATE_LIMITERS.adminImpersonate.analytics).toBe(true);
      });

      it('should preserve ordinary navigation telemetry fanout', () => {
        // A desktop transition can emit six impressions plus activation and
        // readiness. Keep at least one such transition per second available.
        expect(RATE_LIMITERS.navigationTelemetry.limit).toBeGreaterThanOrEqual(
          8 * 60
        );
        expect(RATE_LIMITERS.navigationTelemetry.window).toBe('1 m');
      });

      it('should disable analytics for high-volume public endpoints', () => {
        expect(RATE_LIMITERS.publicProfile.analytics).toBe(false);
        expect(RATE_LIMITERS.publicClick.analytics).toBe(false);
        expect(RATE_LIMITERS.health.analytics).toBe(false);
      });

      it('keeps anonymous traffic on the lower-command fixed-window policy', () => {
        const anonymousLimiters = Object.values(RATE_LIMITERS).filter(
          limiter => limiter.trafficClass === 'anonymous'
        );

        expect(anonymousLimiters.length).toBeGreaterThan(15);

        for (const limiter of anonymousLimiters) {
          expect(limiter.analytics).toBe(false);
          if (limiter.algorithm === 'sliding-window') {
            expect(limiter.anonymousCostException).toMatch(/rolling-window/i);
          }
        }
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
