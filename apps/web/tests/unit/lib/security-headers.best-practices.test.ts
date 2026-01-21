/**
 * Unit tests for Security Headers Module - Best Practices & Environment Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiSecurityHeaders,
  CROSS_ORIGIN_OPENER_POLICY,
  CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN,
  CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN,
  findHeaderByKey,
  getDevelopmentSecurityHeaders,
  getProductionSecurityHeaders,
  HSTS_MAX_AGE_SECONDS,
  PERMISSIONS_POLICY,
  STRICT_TRANSPORT_SECURITY,
  X_CONTENT_TYPE_OPTIONS,
  X_FRAME_OPTIONS,
} from '@/lib/security/headers';

describe('Security Headers - Security Best Practices', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('HSTS compliance', () => {
    it('meets HSTS preload requirements', () => {
      const hstsValue = STRICT_TRANSPORT_SECURITY.value;

      // Must have max-age of at least 1 year
      const maxAgeMatch = hstsValue.match(/max-age=(\d+)/);
      expect(maxAgeMatch).not.toBeNull();
      const maxAge = parseInt(maxAgeMatch![1], 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);

      // Must include includeSubDomains
      expect(hstsValue).toContain('includeSubDomains');

      // Must include preload
      expect(hstsValue).toContain('preload');
    });

    it('HSTS max-age constant matches header value', () => {
      const hstsValue = STRICT_TRANSPORT_SECURITY.value;
      expect(hstsValue).toContain(`max-age=${HSTS_MAX_AGE_SECONDS}`);
    });
  });

  describe('Clickjacking protection', () => {
    it('X-Frame-Options is set to DENY', () => {
      expect(X_FRAME_OPTIONS.value).toBe('DENY');
    });
  });

  describe('MIME type sniffing prevention', () => {
    it('X-Content-Type-Options is set to nosniff', () => {
      expect(X_CONTENT_TYPE_OPTIONS.value).toBe('nosniff');
    });
  });

  describe('Cross-origin isolation', () => {
    it('COOP allows popups for OAuth flows', () => {
      expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe('same-origin-allow-popups');
    });

    it('CORP same-origin protects API routes', () => {
      expect(CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN.value).toBe(
        'same-origin'
      );
    });

    it('CORP cross-origin allows CDN access for assets', () => {
      expect(CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN.value).toBe(
        'cross-origin'
      );
    });
  });

  describe('Feature policy restrictions', () => {
    it('disables camera access', () => {
      expect(PERMISSIONS_POLICY.value).toMatch(/camera=\(\)/);
    });

    it('disables microphone access', () => {
      expect(PERMISSIONS_POLICY.value).toMatch(/microphone=\(\)/);
    });

    it('disables geolocation access', () => {
      expect(PERMISSIONS_POLICY.value).toMatch(/geolocation=\(\)/);
    });
  });
});

describe('Security Headers - Environment-Conditional Headers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('HSTS is only included in production', () => {
    const devHeaders = getDevelopmentSecurityHeaders();
    const prodHeaders = getProductionSecurityHeaders();

    expect(
      findHeaderByKey(devHeaders, 'Strict-Transport-Security')
    ).toBeUndefined();
    expect(
      findHeaderByKey(prodHeaders, 'Strict-Transport-Security')
    ).toBeDefined();
  });

  it('COOP is only included in production', () => {
    const devHeaders = getDevelopmentSecurityHeaders();
    const prodHeaders = getProductionSecurityHeaders();

    expect(
      findHeaderByKey(devHeaders, 'Cross-Origin-Opener-Policy')
    ).toBeUndefined();
    expect(
      findHeaderByKey(prodHeaders, 'Cross-Origin-Opener-Policy')
    ).toBeDefined();
  });

  it('CORP is only included in production for API routes', () => {
    const devHeaders = buildApiSecurityHeaders({
      includeProductionHeaders: false,
    });
    const prodHeaders = buildApiSecurityHeaders({
      includeProductionHeaders: true,
    });

    expect(
      findHeaderByKey(devHeaders, 'Cross-Origin-Resource-Policy')
    ).toBeUndefined();
    expect(
      findHeaderByKey(prodHeaders, 'Cross-Origin-Resource-Policy')
    ).toBeDefined();
  });
});
