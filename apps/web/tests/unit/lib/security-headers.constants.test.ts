/**
 * Unit tests for Security Headers Module - Constants
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CROSS_ORIGIN_OPENER_POLICY,
  CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN,
  CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN,
  HEADER_KEYS,
  HSTS_MAX_AGE_SECONDS,
  isValidSecurityHeader,
  PERMISSIONS_POLICY,
  REFERRER_POLICY,
  STRICT_TRANSPORT_SECURITY,
  X_CONTENT_TYPE_OPTIONS,
  X_FRAME_OPTIONS,
} from '@/lib/security/headers';

describe('Security Headers - Header Constants', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('X-Frame-Options', () => {
    it('has the correct key and value', () => {
      expect(X_FRAME_OPTIONS.key).toBe('X-Frame-Options');
      expect(X_FRAME_OPTIONS.value).toBe('DENY');
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(X_FRAME_OPTIONS)).toBe(true);
    });
  });

  describe('X-Content-Type-Options', () => {
    it('has the correct key and value', () => {
      expect(X_CONTENT_TYPE_OPTIONS.key).toBe('X-Content-Type-Options');
      expect(X_CONTENT_TYPE_OPTIONS.value).toBe('nosniff');
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(X_CONTENT_TYPE_OPTIONS)).toBe(true);
    });
  });

  describe('Referrer-Policy', () => {
    it('has the correct key and value', () => {
      expect(REFERRER_POLICY.key).toBe('Referrer-Policy');
      expect(REFERRER_POLICY.value).toBe('origin-when-cross-origin');
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(REFERRER_POLICY)).toBe(true);
    });
  });

  describe('Permissions-Policy', () => {
    it('has the correct key and value', () => {
      expect(PERMISSIONS_POLICY.key).toBe('Permissions-Policy');
      expect(PERMISSIONS_POLICY.value).toBe(
        'camera=(), microphone=(), geolocation=()'
      );
    });

    it('disables camera access', () => {
      expect(PERMISSIONS_POLICY.value).toContain('camera=()');
    });

    it('disables microphone access', () => {
      expect(PERMISSIONS_POLICY.value).toContain('microphone=()');
    });

    it('disables geolocation access', () => {
      expect(PERMISSIONS_POLICY.value).toContain('geolocation=()');
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(PERMISSIONS_POLICY)).toBe(true);
    });
  });

  describe('Strict-Transport-Security (HSTS)', () => {
    it('has the correct key', () => {
      expect(STRICT_TRANSPORT_SECURITY.key).toBe('Strict-Transport-Security');
    });

    it('has max-age of at least 1 year (31536000 seconds)', () => {
      const maxAgeMatch =
        STRICT_TRANSPORT_SECURITY.value.match(/max-age=(\d+)/);
      expect(maxAgeMatch).not.toBeNull();
      const maxAge = parseInt(maxAgeMatch![1], 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);
    });

    it('includes includeSubDomains directive', () => {
      expect(STRICT_TRANSPORT_SECURITY.value).toContain('includeSubDomains');
    });

    it('includes preload directive', () => {
      expect(STRICT_TRANSPORT_SECURITY.value).toContain('preload');
    });

    it('has HSTS_MAX_AGE_SECONDS constant set to 1 year', () => {
      expect(HSTS_MAX_AGE_SECONDS).toBe(31536000);
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(STRICT_TRANSPORT_SECURITY)).toBe(true);
    });
  });

  describe('Cross-Origin-Opener-Policy (COOP)', () => {
    it('has the correct key and value', () => {
      expect(CROSS_ORIGIN_OPENER_POLICY.key).toBe('Cross-Origin-Opener-Policy');
      expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe('same-origin-allow-popups');
    });

    it('uses same-origin-allow-popups to allow OAuth popups', () => {
      expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe('same-origin-allow-popups');
    });

    it('is a valid security header', () => {
      expect(isValidSecurityHeader(CROSS_ORIGIN_OPENER_POLICY)).toBe(true);
    });
  });

  describe('Cross-Origin-Resource-Policy (CORP)', () => {
    it('has same-origin value for API routes', () => {
      expect(CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN.key).toBe(
        'Cross-Origin-Resource-Policy'
      );
      expect(CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN.value).toBe(
        'same-origin'
      );
    });

    it('has cross-origin value for static assets', () => {
      expect(CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN.key).toBe(
        'Cross-Origin-Resource-Policy'
      );
      expect(CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN.value).toBe(
        'cross-origin'
      );
    });

    it('same-origin variant is a valid security header', () => {
      expect(
        isValidSecurityHeader(CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN)
      ).toBe(true);
    });

    it('cross-origin variant is a valid security header', () => {
      expect(
        isValidSecurityHeader(CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN)
      ).toBe(true);
    });
  });
});

describe('Security Headers - HEADER_KEYS constant', () => {
  it('has all expected header keys defined', () => {
    expect(HEADER_KEYS.X_FRAME_OPTIONS).toBe('X-Frame-Options');
    expect(HEADER_KEYS.X_CONTENT_TYPE_OPTIONS).toBe('X-Content-Type-Options');
    expect(HEADER_KEYS.REFERRER_POLICY).toBe('Referrer-Policy');
    expect(HEADER_KEYS.PERMISSIONS_POLICY).toBe('Permissions-Policy');
    expect(HEADER_KEYS.STRICT_TRANSPORT_SECURITY).toBe(
      'Strict-Transport-Security'
    );
    expect(HEADER_KEYS.CROSS_ORIGIN_OPENER_POLICY).toBe(
      'Cross-Origin-Opener-Policy'
    );
    expect(HEADER_KEYS.CROSS_ORIGIN_RESOURCE_POLICY).toBe(
      'Cross-Origin-Resource-Policy'
    );
    expect(HEADER_KEYS.CONTENT_SECURITY_POLICY).toBe('Content-Security-Policy');
    expect(HEADER_KEYS.X_ROBOTS_TAG).toBe('X-Robots-Tag');
    expect(HEADER_KEYS.CACHE_CONTROL).toBe('Cache-Control');
  });
});
