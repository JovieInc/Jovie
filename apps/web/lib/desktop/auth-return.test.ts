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
    expect(sanitizeDesktopReturnRoute('/auth/start')).toBeNull();
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

  it('accepts central desktop auth start URLs with PKCE and sanitized return targets', () => {
    expect(
      sanitizeDesktopAuthUrl(
        '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
        'https://jov.ie'
      )
    ).toBe(
      'https://jov.ie/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
    );

    expect(
      sanitizeDesktopAuthUrl(
        'https://evil.com/auth/start?client=electron&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
        'https://jov.ie'
      )
    ).toBeNull();
    expect(
      sanitizeDesktopAuthUrl(
        '/auth/start?client=web&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
        'https://jov.ie'
      )
    ).toBeNull();
    expect(
      sanitizeDesktopAuthUrl(
        '/auth/start?client=electron&intent=sign_in&return_to=%2Fauth%2Fcallback&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
        'https://jov.ie'
      )
    ).toBeNull();
  });
});
