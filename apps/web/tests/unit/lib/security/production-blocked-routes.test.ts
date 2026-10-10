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
    expect(PRODUCT_SCREENSHOT_CAPTURE_PAGE_PATHS).toEqual([
      '/demo',
      '/demo/audience',
      '/demo/showcase/analytics',
      '/demo/showcase/earnings',
      '/demo/showcase/links',
      '/demo/showcase/release-tracked-links',
      '/demo/showcase/releases',
      '/demo/showcase/settings',
      '/exp/shell-v1',
    ]);
  });

  it('lets screenshot capture reach the shell-material /demo routes only', () => {
    const options = { allowProductScreenshotCaptureRoutes: true };
    expect(isProductionBlockedDebugPath('/demo/audience', options)).toBe(false);
    expect(isProductionBlockedDebugPath('/demo/onboarding', options)).toBe(
      true
    );
    expect(isProductionBlockedDebugPath('/demo/audience')).toBe(true);
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
