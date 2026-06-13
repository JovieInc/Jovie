import { describe, expect, it } from 'vitest';
import {
  isProductionBlockedDebugPath,
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
      expect.arrayContaining(['/dev/', '/exp/', '/ui/'])
    );
  });

  it.each([
    '/api/dev/test-auth/session',
    '/api/dev/clear-session',
    '/api/test/onboarding-toggle',
    '/api/sentry-example-api',
    '/dev/smart-links',
    '/exp/shell-v1',
    '/ui/buttons',
    '/sandbox',
    '/spinner-test',
    '/sentry-example-page',
  ])('blocks %s outside development', route => {
    expect(isProductionBlockedDebugPath(route)).toBe(true);
  });

  it.each([
    '/',
    '/demo',
    '/demo/audience',
    '/hud',
    '/hud-tv',
    '/sidebar-demo',
    '/api/health/auth',
    '/api/dev/test-auth/mobile-provider-complete',
  ])('does not block public or specially gated route %s', route => {
    expect(isProductionBlockedDebugPath(route)).toBe(false);
  });
});
