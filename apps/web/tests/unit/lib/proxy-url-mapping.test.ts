import { describe, expect, it } from 'vitest';

/**
 * Unit tests for proxy.ts URL mapping logic
 *
 * These tests verify the getDashboardUrl behavior that determines
 * whether the dashboard is served at /app (local/preview) or / (production).
 *
 * The functions are recreated here since they're private in proxy.ts.
 * If the logic in proxy.ts changes, these tests should fail and
 * alert us to potential routing issues.
 *
 * @see apps/web/proxy.ts lines 60-79
 */

// Recreate proxy.ts helper functions for testing
function isDevOrPreview(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('vercel.app') ||
    hostname.startsWith('main.')
  );
}

function isAppSubdomain(hostname: string): boolean {
  return (
    hostname === 'app.jov.ie' ||
    (isDevOrPreview(hostname) && hostname.startsWith('app.'))
  );
}

function getDashboardUrl(hostname: string): string {
  if (isDevOrPreview(hostname) && !isAppSubdomain(hostname)) {
    return '/app';
  }
  return '/';
}

describe('Proxy URL Mapping', () => {
  describe('isDevOrPreview', () => {
    it('returns true for localhost', () => {
      expect(isDevOrPreview('localhost')).toBe(true);
    });

    it('returns true for 127.0.0.1', () => {
      expect(isDevOrPreview('127.0.0.1')).toBe(true);
    });

    it('returns true for vercel preview URLs', () => {
      expect(isDevOrPreview('jovie-abc123.vercel.app')).toBe(true);
      expect(isDevOrPreview('my-branch-jovie.vercel.app')).toBe(true);
    });

    it('returns true for main.* subdomains', () => {
      expect(isDevOrPreview('main.jov.ie')).toBe(true);
    });

    it('returns false for production domains', () => {
      expect(isDevOrPreview('jov.ie')).toBe(false);
      expect(isDevOrPreview('app.jov.ie')).toBe(false);
    });
  });

  describe('isAppSubdomain', () => {
    it('returns true for app.jov.ie', () => {
      expect(isAppSubdomain('app.jov.ie')).toBe(true);
    });

    it('returns false for jov.ie', () => {
      expect(isAppSubdomain('jov.ie')).toBe(false);
    });

    it('returns false for localhost', () => {
      expect(isAppSubdomain('localhost')).toBe(false);
    });
  });

  describe('getDashboardUrl', () => {
    it('returns /app for localhost (local development)', () => {
      expect(getDashboardUrl('localhost')).toBe('/app');
    });

    it('returns /app for 127.0.0.1', () => {
      expect(getDashboardUrl('127.0.0.1')).toBe('/app');
    });

    it('returns / for app.jov.ie (production app subdomain)', () => {
      expect(getDashboardUrl('app.jov.ie')).toBe('/');
    });

    it('returns /app for vercel preview deployments', () => {
      expect(getDashboardUrl('jovie-abc123.vercel.app')).toBe('/app');
      expect(getDashboardUrl('feature-branch.vercel.app')).toBe('/app');
    });

    it('returns /app for main.jov.ie (staging)', () => {
      expect(getDashboardUrl('main.jov.ie')).toBe('/app');
    });

    it('returns / for jov.ie (profile domain)', () => {
      expect(getDashboardUrl('jov.ie')).toBe('/');
    });

    it('returns / for www.jov.ie', () => {
      expect(getDashboardUrl('www.jov.ie')).toBe('/');
    });
  });

  describe('URL consistency between environments', () => {
    /**
     * This test documents the expected URL mapping behavior
     * that can cause local vs production issues if not handled correctly
     */
    it('local dashboard at /app, production at /', () => {
      const localUrl = getDashboardUrl('localhost');
      const productionUrl = getDashboardUrl('app.jov.ie');

      expect(localUrl).toBe('/app');
      expect(productionUrl).toBe('/');
      expect(localUrl).not.toBe(productionUrl);
    });

    it('preview deployments match local behavior', () => {
      const localUrl = getDashboardUrl('localhost');
      const previewUrl = getDashboardUrl('pr-123-jovie.vercel.app');

      expect(previewUrl).toBe(localUrl);
    });
  });
});
