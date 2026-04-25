import { describe, expect, it } from 'vitest';
import {
  buildAuthRouteUrl,
  buildProtectedAuthRedirectUrl,
} from '@/lib/auth/build-auth-route-url';

describe('buildAuthRouteUrl', () => {
  it('forwards only a valid redirect_url', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2Fonboarding&plan=pro'
    );

    expect(buildAuthRouteUrl('/signin', searchParams)).toBe(
      '/signin?redirect_url=%2Fonboarding'
    );
  });

  it('drops invalid redirect_url values', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=https%3A%2F%2Fevil.com'
    );

    expect(buildAuthRouteUrl('/signup', searchParams)).toBe('/signup');
  });

  it('does not leak the parsing base for protocol-relative paths', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2Fonboarding&plan=pro'
    );

    expect(buildAuthRouteUrl('//evil.com/path', searchParams)).toBe(
      '/path?redirect_url=%2Fonboarding'
    );
  });
});

describe('buildProtectedAuthRedirectUrl', () => {
  it('preserves the protected route query string in redirect_url', () => {
    expect(
      buildProtectedAuthRedirectUrl(
        '/signin',
        '/app/dashboard/profile',
        '?panel=profile'
      )
    ).toBe(
      '/signin?redirect_url=%2Fapp%2Fdashboard%2Fprofile%3Fpanel%3Dprofile'
    );
  });

  it('falls back to the pathname when the search string is not usable', () => {
    expect(
      buildProtectedAuthRedirectUrl('/signin', '/app/settings/account', '#hash')
    ).toBe('/signin?redirect_url=%2Fapp%2Fsettings%2Faccount');
  });
});
