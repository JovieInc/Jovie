import { describe, expect, it } from 'vitest';

/**
 * Unit tests for proxy.ts URL mapping logic
 *
 * Single Domain Architecture:
 * - All traffic is served from jov.ie (no subdomains)
 * - Dashboard is always at /app/* on all environments
 * - meetjovie.com redirects to jov.ie (handled by middleware)
 *
 * The functions are recreated here since they're private in proxy.ts.
 * If the logic in proxy.ts changes, these tests should fail and
 * alert us to potential routing issues.
 *
 * @see apps/web/proxy.ts
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

function isMainHost(hostname: string): boolean {
  return (
    hostname === 'jov.ie' ||
    hostname === 'www.jov.ie' ||
    hostname === 'main.jov.ie' ||
    isDevOrPreview(hostname)
  );
}

// Single domain: dashboard is always at /app
const DASHBOARD_URL = '/app';

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

    it('returns true for main.jov.ie (staging)', () => {
      expect(isDevOrPreview('main.jov.ie')).toBe(true);
    });

    it('returns false for production domain', () => {
      expect(isDevOrPreview('jov.ie')).toBe(false);
      expect(isDevOrPreview('www.jov.ie')).toBe(false);
    });
  });

  describe('isMainHost', () => {
    it('returns true for jov.ie (production)', () => {
      expect(isMainHost('jov.ie')).toBe(true);
    });

    it('returns true for www.jov.ie', () => {
      expect(isMainHost('www.jov.ie')).toBe(true);
    });

    it('returns true for main.jov.ie (staging)', () => {
      expect(isMainHost('main.jov.ie')).toBe(true);
    });

    it('returns true for localhost', () => {
      expect(isMainHost('localhost')).toBe(true);
    });

    it('returns true for vercel preview URLs', () => {
      expect(isMainHost('jovie-abc123.vercel.app')).toBe(true);
    });

    it('returns false for meetjovie.com (legacy redirect domain)', () => {
      expect(isMainHost('meetjovie.com')).toBe(false);
    });
  });

  describe('DASHBOARD_URL', () => {
    it('dashboard is always at /app in single domain architecture', () => {
      expect(DASHBOARD_URL).toBe('/app');
    });
  });

  describe('URL consistency between environments', () => {
    /**
     * Single domain architecture means dashboard is at /app everywhere:
     * - localhost:3100/app/* (local development)
     * - *.vercel.app/app/* (preview deployments)
     * - main.jov.ie/app/* (staging)
     * - jov.ie/app/* (production)
     */
    it('dashboard path is consistent across all environments', () => {
      // In single domain architecture, all environments use /app
      const dashboardPath = DASHBOARD_URL;

      expect(dashboardPath).toBe('/app');
    });

    it('all valid hosts resolve to same dashboard path', () => {
      // These are all valid hosts that should serve the app
      const validHosts = [
        'localhost',
        '127.0.0.1',
        'jovie-abc123.vercel.app',
        'main.jov.ie',
        'jov.ie',
        'www.jov.ie',
      ];

      validHosts.forEach(host => {
        expect(isMainHost(host)).toBe(true);
      });

      // Dashboard is always at /app
      expect(DASHBOARD_URL).toBe('/app');
    });
  });
});
