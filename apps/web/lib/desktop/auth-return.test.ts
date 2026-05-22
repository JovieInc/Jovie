import { describe, expect, it } from 'vitest';
import {
  buildAuthRouteUrlWithDesktopReturn,
  buildDesktopAuthDeepLink,
  buildDesktopAuthReturnPath,
  buildDesktopCallbackFallbackRedirectUrl,
  getDesktopReturnRoute,
  sanitizeDesktopAuthUrl,
  sanitizeDesktopReturnRoute,
} from './auth-return';

describe('desktop auth return helpers', () => {
  it('keeps same-app relative return routes with query strings', () => {
    expect(sanitizeDesktopReturnRoute('/app/settings?tab=billing')).toBe(
      '/app/settings?tab=billing'
    );
  });

  it('rejects external, protocol-relative, encoded, and internal auth routes', () => {
    expect(sanitizeDesktopReturnRoute('https://evil.com/app')).toBeNull();
    expect(sanitizeDesktopReturnRoute('//evil.com/app')).toBeNull();
    expect(sanitizeDesktopReturnRoute('/%2F%2Fevil.com')).toBeNull();
    expect(sanitizeDesktopReturnRoute('/signin')).toBeNull();
    expect(sanitizeDesktopReturnRoute('/signup/sso-callback')).toBeNull();
    expect(sanitizeDesktopReturnRoute('/auth-return?route=/app')).toBeNull();
    expect(
      sanitizeDesktopReturnRoute('/mobile-auth-return?route=/app')
    ).toBeNull();
    expect(sanitizeDesktopReturnRoute('/api/auth/reset')).toBeNull();
  });

  it('falls back when desktop_return is missing or invalid', () => {
    expect(getDesktopReturnRoute(new URLSearchParams(''), '/start')).toBe(
      '/start'
    );
    expect(
      getDesktopReturnRoute(
        new URLSearchParams('desktop_return=https%3A%2F%2Fevil.com'),
        '/app'
      )
    ).toBe('/app');
  });

  it('builds the web auth-return route and native deep link with sanitized route', () => {
    expect(buildDesktopAuthReturnPath('/app/chat?thread=abc')).toBe(
      '/auth-return?route=%2Fapp%2Fchat%3Fthread%3Dabc'
    );
    expect(buildDesktopAuthDeepLink('/app/chat?thread=abc')).toBe(
      'jovie://auth-return?route=%2Fapp%2Fchat%3Fthread%3Dabc'
    );
  });

  it('builds the desktop callback fallback redirect route', () => {
    expect(
      buildDesktopCallbackFallbackRedirectUrl(
        new URLSearchParams('desktop_return=%2Fapp%2Fsettings'),
        '/app'
      )
    ).toBe('/auth-return?route=%2Fapp%2Fsettings');

    expect(
      buildDesktopCallbackFallbackRedirectUrl(new URLSearchParams(''), '/start')
    ).toBe('/start');
  });

  it('preserves only sanitized desktop_return on auth cross-links', () => {
    expect(
      buildAuthRouteUrlWithDesktopReturn(
        '/signup',
        new URLSearchParams(
          'desktop_return=%2Fapp%2Fsettings&redirect_url=%2Fignored'
        )
      )
    ).toBe('/signup?desktop_return=%2Fapp%2Fsettings');

    expect(
      buildAuthRouteUrlWithDesktopReturn(
        '/signin',
        new URLSearchParams('desktop_return=https%3A%2F%2Fevil.com')
      )
    ).toBe('/signin');
  });

  it('accepts desktop auth URLs only for app auth routes with desktop_return', () => {
    expect(
      sanitizeDesktopAuthUrl(
        '/signin?desktop_return=%2Fapp%2Fsettings',
        'https://jov.ie'
      )
    ).toBe('https://jov.ie/signin?desktop_return=%2Fapp%2Fsettings');

    expect(
      sanitizeDesktopAuthUrl(
        'https://evil.com/signin?desktop_return=%2Fapp',
        'https://jov.ie'
      )
    ).toBeNull();
    expect(
      sanitizeDesktopAuthUrl('/pricing?desktop_return=%2Fapp', 'https://jov.ie')
    ).toBeNull();
    expect(sanitizeDesktopAuthUrl('/signin', 'https://jov.ie')).toBeNull();
  });
});
