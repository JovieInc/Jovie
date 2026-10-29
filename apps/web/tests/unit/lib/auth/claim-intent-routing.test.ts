import { describe, expect, it } from 'vitest';
import {
  getAuthenticatedAuthRouteRedirect,
  getStartRouteRedirect,
} from '@/lib/auth/access-route-redirect';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

describe('explicit visitor intent survives authentication', () => {
  it.each(['/', '/pricing', '/legal/privacy', '/david', '/start?handle=david'])(
    'preserves %s for a signed-in visitor still onboarding',
    redirectUrl => {
      expect(
        getAuthenticatedAuthRouteRedirect(CanonicalUserState.NEEDS_ONBOARDING, {
          redirectUrl,
        })
      ).toBe(redirectUrl);
    }
  );

  it('retains a validated handle or conversation intent on /start for an active account', () => {
    expect(
      getStartRouteRedirect(CanonicalUserState.ACTIVE, { hasEntryIntent: true })
    ).toBeNull();
    expect(getStartRouteRedirect(CanonicalUserState.ACTIVE)).toBe('/app');
  });

  it('keeps lifecycle and security gates for protected app destinations', () => {
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.WAITLIST_PENDING, {
        redirectUrl: '/app/releases',
      })
    ).toBe('/waitlist');
    expect(
      getAuthenticatedAuthRouteRedirect(CanonicalUserState.BANNED, {
        redirectUrl: '/pricing',
      })
    ).toBe('/unavailable');
  });

  it('preserves an explicit root but refuses external, encoded and control-character escapes', () => {
    expect(sanitizeRedirectUrl('/')).toBe('/');
    for (const value of [
      '//evil.example',
      '/%2fexample.com',
      '/%5cexample.com',
      '/\nevil.example',
      'https://evil.example',
    ]) {
      expect(sanitizeRedirectUrl(value)).toBeNull();
    }
  });
});
