import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildAuthRouteUrl,
  buildProtectedAuthRedirectUrl,
  getDefaultSignUpFallbackRedirectUrl,
} from '@/lib/auth/build-auth-route-url';

describe('getDefaultSignUpFallbackRedirectUrl', () => {
  it('routes new sign-ups to onboarding start by default', () => {
    expect(getDefaultSignUpFallbackRedirectUrl()).toBe(APP_ROUTES.START);
  });
});

describe('buildAuthRouteUrl', () => {
  it('forwards a valid redirect_url and claim handle', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2Fonboarding%3Fhandle%3Dmotion&plan=founding&handle=%40Motion&email=you%40example.com'
    );

    expect(buildAuthRouteUrl('/signin', searchParams)).toBe(
      '/signin?handle=motion&redirect_url=%2Fonboarding%3Fhandle%3Dmotion'
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
      'redirect_url=%2Fonboarding&plan=founding'
    );

    expect(buildAuthRouteUrl('//evil.com/path', searchParams)).toBe(
      '/path?redirect_url=%2Fonboarding'
    );
  });

  it('forwards paid plan, billing interval, and artist through auth cross-links', () => {
    const searchParams = new URLSearchParams(
      'plan=pro&interval=annual&artist_name=Motion&email=you%40example.com&oauth_error=account_exists'
    );

    expect(buildAuthRouteUrl('/signin', searchParams)).toBe(
      '/signin?plan=pro&interval=annual&artist_name=Motion'
    );
  });

  it('drops unknown plans and invented billing intervals', () => {
    const searchParams = new URLSearchParams(
      'plan=founding&billing=lifetime&artist=https%3A%2F%2Fevil.example'
    );

    expect(buildAuthRouteUrl('/signup', searchParams)).toBe('/signup');
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
