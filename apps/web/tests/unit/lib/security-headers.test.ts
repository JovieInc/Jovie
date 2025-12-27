import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildApiSecurityHeaders,
  buildBaseSecurityHeaders,
  buildStaticAssetSecurityHeaders,
  CROSS_ORIGIN_OPENER_POLICY,
  CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN,
  CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN,
  findHeaderByKey,
  getDevelopmentSecurityHeaders,
  getEnvironmentContext,
  getProductionSecurityHeaders,
  HEADER_KEYS,
  HSTS_MAX_AGE_SECONDS,
  isNonLocalEnvironment,
  isValidSecurityHeader,
  PERMISSIONS_POLICY,
  REFERRER_POLICY,
  type SecurityHeader,
  STRICT_TRANSPORT_SECURITY,
  X_CONTENT_TYPE_OPTIONS,
  X_FRAME_OPTIONS,
} from '@/lib/security/headers';

describe('Security Headers Module', () => {
  // Reset environment variables between tests
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Header Constants', () => {
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
        expect(CROSS_ORIGIN_OPENER_POLICY.key).toBe(
          'Cross-Origin-Opener-Policy'
        );
        expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe(
          'same-origin-allow-popups'
        );
      });

      it('uses same-origin-allow-popups to allow OAuth popups', () => {
        expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe(
          'same-origin-allow-popups'
        );
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

  describe('HEADER_KEYS constant', () => {
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
      expect(HEADER_KEYS.CONTENT_SECURITY_POLICY).toBe(
        'Content-Security-Policy'
      );
      expect(HEADER_KEYS.X_ROBOTS_TAG).toBe('X-Robots-Tag');
      expect(HEADER_KEYS.CACHE_CONTROL).toBe('Cache-Control');
    });
  });

  describe('Helper Functions', () => {
    describe('isNonLocalEnvironment', () => {
      it('returns false when VERCEL_ENV is not set', () => {
        vi.stubEnv('VERCEL_ENV', '');
        expect(isNonLocalEnvironment()).toBe(false);
      });

      it('returns false when VERCEL_ENV is development', () => {
        vi.stubEnv('VERCEL_ENV', 'development');
        expect(isNonLocalEnvironment()).toBe(false);
      });

      it('returns true when VERCEL_ENV is production', () => {
        vi.stubEnv('VERCEL_ENV', 'production');
        expect(isNonLocalEnvironment()).toBe(true);
      });

      it('returns true when VERCEL_ENV is preview', () => {
        vi.stubEnv('VERCEL_ENV', 'preview');
        expect(isNonLocalEnvironment()).toBe(true);
      });
    });

    describe('getEnvironmentContext', () => {
      it('returns production context when in production', () => {
        vi.stubEnv('VERCEL_ENV', 'production');
        vi.stubEnv('NODE_ENV', 'production');
        const context = getEnvironmentContext();
        expect(context.isProduction).toBe(true);
        expect(context.isDevelopment).toBe(false);
      });

      it('returns development context when in development', () => {
        vi.stubEnv('VERCEL_ENV', '');
        vi.stubEnv('NODE_ENV', 'development');
        const context = getEnvironmentContext();
        expect(context.isProduction).toBe(false);
        expect(context.isDevelopment).toBe(true);
      });
    });

    describe('isValidSecurityHeader', () => {
      it('returns true for valid header', () => {
        const validHeader: SecurityHeader = { key: 'X-Test', value: 'test' };
        expect(isValidSecurityHeader(validHeader)).toBe(true);
      });

      it('returns false for empty key', () => {
        const invalidHeader: SecurityHeader = { key: '', value: 'test' };
        expect(isValidSecurityHeader(invalidHeader)).toBe(false);
      });

      it('returns false for empty value', () => {
        const invalidHeader: SecurityHeader = { key: 'X-Test', value: '' };
        expect(isValidSecurityHeader(invalidHeader)).toBe(false);
      });

      it('returns false for non-string key', () => {
        const invalidHeader = {
          key: 123,
          value: 'test',
        } as unknown as SecurityHeader;
        expect(isValidSecurityHeader(invalidHeader)).toBe(false);
      });

      it('returns false for non-string value', () => {
        const invalidHeader = {
          key: 'X-Test',
          value: 123,
        } as unknown as SecurityHeader;
        expect(isValidSecurityHeader(invalidHeader)).toBe(false);
      });
    });

    describe('findHeaderByKey', () => {
      const testHeaders: SecurityHeader[] = [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
      ];

      it('finds header with exact key match', () => {
        const header = findHeaderByKey(testHeaders, 'X-Frame-Options');
        expect(header).toEqual({ key: 'X-Frame-Options', value: 'DENY' });
      });

      it('finds header case-insensitively', () => {
        const header = findHeaderByKey(testHeaders, 'x-frame-options');
        expect(header).toEqual({ key: 'X-Frame-Options', value: 'DENY' });
      });

      it('returns undefined for non-existent key', () => {
        const header = findHeaderByKey(testHeaders, 'X-Nonexistent');
        expect(header).toBeUndefined();
      });

      it('returns undefined for empty array', () => {
        const header = findHeaderByKey([], 'X-Frame-Options');
        expect(header).toBeUndefined();
      });
    });
  });

  describe('Header Builder Functions', () => {
    describe('buildBaseSecurityHeaders', () => {
      it('includes all base security headers in development', () => {
        const headers = buildBaseSecurityHeaders({
          env: { isProduction: false, isDevelopment: true },
          includeProductionHeaders: false,
        });

        expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
        expect(
          findHeaderByKey(headers, 'X-Content-Type-Options')
        ).toBeDefined();
        expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
        expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
      });

      it('excludes production-only headers in development', () => {
        const headers = buildBaseSecurityHeaders({
          env: { isProduction: false, isDevelopment: true },
          includeProductionHeaders: false,
        });

        expect(
          findHeaderByKey(headers, 'Strict-Transport-Security')
        ).toBeUndefined();
        expect(
          findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
        ).toBeUndefined();
      });

      it('includes production-only headers in production', () => {
        const headers = buildBaseSecurityHeaders({
          env: { isProduction: true, isDevelopment: false },
          includeProductionHeaders: true,
        });

        expect(
          findHeaderByKey(headers, 'Strict-Transport-Security')
        ).toBeDefined();
        expect(
          findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
        ).toBeDefined();
      });

      it('respects includeProductionHeaders override', () => {
        const headers = buildBaseSecurityHeaders({
          env: { isProduction: false, isDevelopment: true },
          includeProductionHeaders: true,
        });

        expect(
          findHeaderByKey(headers, 'Strict-Transport-Security')
        ).toBeDefined();
        expect(
          findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
        ).toBeDefined();
      });

      it('all returned headers are valid', () => {
        const headers = buildBaseSecurityHeaders({
          includeProductionHeaders: true,
        });

        for (const header of headers) {
          expect(isValidSecurityHeader(header)).toBe(true);
        }
      });
    });

    describe('buildApiSecurityHeaders', () => {
      it('includes base security headers', () => {
        const headers = buildApiSecurityHeaders({
          includeProductionHeaders: false,
        });

        expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
        expect(
          findHeaderByKey(headers, 'X-Content-Type-Options')
        ).toBeDefined();
      });

      it('excludes CORP in development', () => {
        const headers = buildApiSecurityHeaders({
          env: { isProduction: false, isDevelopment: true },
          includeProductionHeaders: false,
        });

        expect(
          findHeaderByKey(headers, 'Cross-Origin-Resource-Policy')
        ).toBeUndefined();
      });

      it('includes CORP same-origin in production', () => {
        const headers = buildApiSecurityHeaders({
          env: { isProduction: true, isDevelopment: false },
          includeProductionHeaders: true,
        });

        const corpHeader = findHeaderByKey(
          headers,
          'Cross-Origin-Resource-Policy'
        );
        expect(corpHeader).toBeDefined();
        expect(corpHeader?.value).toBe('same-origin');
      });

      it('all returned headers are valid', () => {
        const headers = buildApiSecurityHeaders({
          includeProductionHeaders: true,
        });

        for (const header of headers) {
          expect(isValidSecurityHeader(header)).toBe(true);
        }
      });
    });

    describe('buildStaticAssetSecurityHeaders', () => {
      it('includes base security headers', () => {
        const headers = buildStaticAssetSecurityHeaders({
          includeProductionHeaders: false,
        });

        expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
        expect(
          findHeaderByKey(headers, 'X-Content-Type-Options')
        ).toBeDefined();
      });

      it('excludes CORP in development', () => {
        const headers = buildStaticAssetSecurityHeaders({
          env: { isProduction: false, isDevelopment: true },
          includeProductionHeaders: false,
        });

        expect(
          findHeaderByKey(headers, 'Cross-Origin-Resource-Policy')
        ).toBeUndefined();
      });

      it('includes CORP cross-origin in production', () => {
        const headers = buildStaticAssetSecurityHeaders({
          env: { isProduction: true, isDevelopment: false },
          includeProductionHeaders: true,
        });

        const corpHeader = findHeaderByKey(
          headers,
          'Cross-Origin-Resource-Policy'
        );
        expect(corpHeader).toBeDefined();
        expect(corpHeader?.value).toBe('cross-origin');
      });

      it('all returned headers are valid', () => {
        const headers = buildStaticAssetSecurityHeaders({
          includeProductionHeaders: true,
        });

        for (const header of headers) {
          expect(isValidSecurityHeader(header)).toBe(true);
        }
      });
    });

    describe('getProductionSecurityHeaders', () => {
      it('includes all base headers', () => {
        const headers = getProductionSecurityHeaders();

        expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
        expect(
          findHeaderByKey(headers, 'X-Content-Type-Options')
        ).toBeDefined();
        expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
        expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
      });

      it('includes production-only headers', () => {
        const headers = getProductionSecurityHeaders();

        expect(
          findHeaderByKey(headers, 'Strict-Transport-Security')
        ).toBeDefined();
        expect(
          findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
        ).toBeDefined();
      });

      it('returns 6 headers total', () => {
        const headers = getProductionSecurityHeaders();
        expect(headers).toHaveLength(6);
      });
    });

    describe('getDevelopmentSecurityHeaders', () => {
      it('includes base headers', () => {
        const headers = getDevelopmentSecurityHeaders();

        expect(findHeaderByKey(headers, 'X-Frame-Options')).toBeDefined();
        expect(
          findHeaderByKey(headers, 'X-Content-Type-Options')
        ).toBeDefined();
        expect(findHeaderByKey(headers, 'Referrer-Policy')).toBeDefined();
        expect(findHeaderByKey(headers, 'Permissions-Policy')).toBeDefined();
      });

      it('excludes production-only headers', () => {
        const headers = getDevelopmentSecurityHeaders();

        expect(
          findHeaderByKey(headers, 'Strict-Transport-Security')
        ).toBeUndefined();
        expect(
          findHeaderByKey(headers, 'Cross-Origin-Opener-Policy')
        ).toBeUndefined();
      });

      it('returns 4 headers total', () => {
        const headers = getDevelopmentSecurityHeaders();
        expect(headers).toHaveLength(4);
      });
    });
  });

  describe('Security Best Practices', () => {
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
        expect(CROSS_ORIGIN_OPENER_POLICY.value).toBe(
          'same-origin-allow-popups'
        );
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

  describe('Environment-Conditional Headers', () => {
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
});
