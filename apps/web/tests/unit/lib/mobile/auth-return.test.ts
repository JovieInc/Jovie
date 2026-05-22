import { describe, expect, it } from 'vitest';
import {
  buildAuthRouteUrlWithMobileReturn,
  buildMobileAuthDeepLink,
  buildMobileAuthReturnPath,
  sanitizeMobileReturnRoute,
} from '@/lib/mobile/auth-return';

describe('mobile auth return helpers', () => {
  it('keeps same-app relative mobile return routes', () => {
    expect(sanitizeMobileReturnRoute('/app/settings?tab=billing')).toBe(
      '/app/settings?tab=billing'
    );
  });

  it('rejects unsafe and auth-loop mobile return routes', () => {
    expect(sanitizeMobileReturnRoute('https://evil.com/app')).toBeNull();
    expect(sanitizeMobileReturnRoute('//evil.com/app')).toBeNull();
    expect(sanitizeMobileReturnRoute('/%2F%2Fevil.com')).toBeNull();
    expect(
      sanitizeMobileReturnRoute('/mobile-auth-return?route=/app')
    ).toBeNull();
    expect(sanitizeMobileReturnRoute('/signin')).toBeNull();
    expect(sanitizeMobileReturnRoute('/api/mobile/v1/me')).toBeNull();
  });

  it('builds the mobile auth-return page and app deep link', () => {
    expect(buildMobileAuthReturnPath('/app/settings')).toBe(
      '/mobile-auth-return?route=%2Fapp%2Fsettings'
    );
    expect(buildMobileAuthDeepLink('ticket_123', '/app/settings')).toBe(
      'ie.jov.jovie://auth-return?ticket=ticket_123&route=%2Fapp%2Fsettings'
    );
  });

  it('preserves only sanitized mobile_return on auth cross-links', () => {
    expect(
      buildAuthRouteUrlWithMobileReturn(
        '/signup',
        new URLSearchParams(
          'mobile_return=%2Fapp%2Fsettings&redirect_url=%2Fignored'
        )
      )
    ).toBe('/signup?mobile_return=%2Fapp%2Fsettings');

    expect(
      buildAuthRouteUrlWithMobileReturn(
        '/signin',
        new URLSearchParams('mobile_return=https%3A%2F%2Fevil.com')
      )
    ).toBe('/signin');
  });
});
