import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  buildAuthRouteUrl,
  buildProtectedAuthRedirectUrl,
  getDefaultSignUpFallbackRedirectUrl,
} from '@/lib/auth/build-auth-route-url';
import { buildAuthRouteUrlWithDesktopReturn } from '@/lib/desktop/auth-return';
import { buildAuthRouteUrlWithMobileReturn } from '@/lib/mobile/auth-return';

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

describe('shared auth context forwarding', () => {
  it.each([
    buildAuthRouteUrl,
    buildAuthRouteUrlWithDesktopReturn,
    buildAuthRouteUrlWithMobileReturn,
  ])(
    'preserves artist separately from handle and normalizes interval across web and native',
    build => {
      const url = new URL(
        build(
          '/signin',
          new URLSearchParams(
            'plan=pro&billing=monthly&artist=Tim%20White&handle=timwhite&auth_state=native_state_123456&desktop_return=%2Fapp&mobile_return=%2Fapp&secret=drop'
          )
        ),
        'https://n'
      );
      expect(url.searchParams.get('plan')).toBe('pro');
      expect(url.searchParams.get('interval')).toBe('month');
      expect(url.searchParams.get('artist_name')).toBe('Tim White');
      expect(url.searchParams.get('handle')).toBe('timwhite');
      expect(url.searchParams.get('auth_state')).toBe('native_state_123456');
      expect(url.searchParams.has('secret')).toBe(false);
    }
  );
  it('drops unsafe claims and retains legacy annual as a non-purchasable identity', () => {
    const url = buildAuthRouteUrl(
      '/signup',
      new URLSearchParams(
        'plan=pro&interval=annual&artist=https://evil.test&handle=bad/slash&auth_state=bad'
      )
    );
    expect(url).toBe('/signup?plan=pro&interval=year');
  });
});
