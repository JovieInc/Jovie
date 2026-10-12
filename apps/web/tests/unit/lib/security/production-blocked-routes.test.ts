import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isProductionBlockedDebugPath,
  PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS,
  PRODUCTION_BLOCKED_API_PREFIXES,
  PRODUCTION_BLOCKED_PAGE_PREFIXES,
} from '@/lib/security/production-blocked-routes';

describe('production-blocked debug routes', () => {
  it('keeps the API inventory explicit', () => {
    expect(PRODUCTION_BLOCKED_API_PREFIXES).toEqual(
      expect.arrayContaining([
        '/api/dev/',
        '/api/test/',
        '/api/sentry-example-api',
      ])
    );
  });

  it('keeps the page inventory explicit', () => {
    expect(PRODUCTION_BLOCKED_PAGE_PREFIXES).toEqual(
      expect.arrayContaining(['/demo/', '/dev/', '/exp/', '/ui/'])
    );
  });

  it('keeps the product screenshot capture inventory exact', () => {
    const selector = readFileSync(
      new URL(
        '../../../product-screenshots/route-dom-certification.spec.ts',
        import.meta.url
      ),
      'utf8'
    );
    const fixtureList = selector.match(
      /const shellMaterialRoutes = \[([\s\S]*?)\] as const;/
    );
    expect(fixtureList).not.toBeNull();
    const routes = [...fixtureList![1].matchAll(/'([^']+)'/g)].map(
      match => match[1]
    );
    expect(routes).toHaveLength(8);
    expect(PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS).toEqual([
      '/exp/shell-v1',
      ...routes,
    ]);
  });

  it.each([
    '/api/dev/test-auth/session',
    '/api/dev/clear-session',
    '/api/test/onboarding-toggle',
    '/api/sentry-example-api',
    '/dev/smart-links',
    '/demo',
    '/demo/audience',
    '/demo/onboarding',
    '/demo/dropdowns',
    '/demo/founder-video',
    '/demo/showcase/public-profile',
    '/exp/shell-v1',
    '/ui/buttons',
    '/sandbox',
    '/spinner-test',
    '/sentry-example-page',
  ])('blocks %s outside development', route => {
    expect(isProductionBlockedDebugPath(route)).toBe(true);
  });

  it('allows only explicit product screenshot fixture routes when requested', () => {
    for (const route of PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS) {
      expect(isProductionBlockedDebugPath(route)).toBe(true);
      expect(
        isProductionBlockedDebugPath(route, {
          allowProductScreenshotCaptureRoutes: true,
        })
      ).toBe(false);
    }
    expect(
      isProductionBlockedDebugPath('/exp/shell-v1', {
        allowProductScreenshotCaptureRoutes: true,
      })
    ).toBe(false);
    expect(
      isProductionBlockedDebugPath('/exp/shell-v1/other', {
        allowProductScreenshotCaptureRoutes: true,
      })
    ).toBe(true);
    expect(
      isProductionBlockedDebugPath('/exp/library-v1', {
        allowProductScreenshotCaptureRoutes: true,
      })
    ).toBe(true);
    for (const route of [
      '/demo/other',
      '/demo/showcase/public-profile',
      '/demo/',
      '/demo%2faudience',
      '/%64emo/audience',
      '/demo%252faudience',
      '/demo%25252faudience',
      '/demo%252525252faudience',
      '/demo/video/../showcase/settings',
      '/demo/video/%2e%2e/showcase/settings',
      '/demo%5caudience',
      '/demo/%invalid',
      '/demo/%2e%2e%2foutside',
      '/%64emo/%2e%2e%2foutside',
      '/api/dev/foo/../test-auth/mobile-provider-complete',
      '/api/dev/%66oo/../test-auth/mobile-provider-complete',
    ]) {
      expect(
        isProductionBlockedDebugPath(route, {
          allowProductScreenshotCaptureRoutes: true,
        })
      ).toBe(true);
    }
  });

  it.each([
    '/',
    '/demo/video',
    '/demovideo',
    '/hud',
    '/hud-tv',
    '/sidebar-demo',
    '/api/health/auth',
    '/api/dev/test-auth/mobile-provider-complete',
  ])('does not block public or specially gated route %s', route => {
    expect(isProductionBlockedDebugPath(route)).toBe(false);
  });
});
