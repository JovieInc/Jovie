import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  canAccessAppShell,
  getAuthenticatedAuthRouteRedirect,
  getClientAuthenticatedAuthEntryRedirect,
  getStartRouteRedirect,
  getWaitlistRouteRedirect,
} from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  toProxyUserState,
} from '@/lib/auth/canonical-user-state';

describe('access route matrix (JOV-3087)', () => {
  describe('admitted / waitlisted / signed-out alignment', () => {
    it.each([
      [CanonicalUserState.UNAUTHENTICATED, false, null],
      [CanonicalUserState.NEEDS_DB_USER, false, null],
      [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION, false, null],
      [CanonicalUserState.WAITLIST_PENDING, false, APP_ROUTES.WAITLIST],
      [CanonicalUserState.NEEDS_ONBOARDING, true, null],
      [CanonicalUserState.ACTIVE, true, APP_ROUTES.DASHBOARD],
      [CanonicalUserState.BANNED, false, APP_ROUTES.UNAVAILABLE],
      [
        CanonicalUserState.USER_CREATION_FAILED,
        false,
        APP_ROUTES.USER_CREATION_ERROR,
      ],
    ])('maps %s to app-shell access %s and /start redirect %s', (state, expectedAppAccess, expectedStartRedirect) => {
      expect(canAccessAppShell(state)).toBe(expectedAppAccess);
      expect(getStartRouteRedirect(state)).toBe(expectedStartRedirect);
    });

    it.each([
      [CanonicalUserState.UNAUTHENTICATED, APP_ROUTES.SIGNIN],
      [CanonicalUserState.NEEDS_DB_USER, '/start?fresh_signup=true'],
      [
        CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
        '/start?fresh_signup=true',
      ],
      [CanonicalUserState.WAITLIST_PENDING, APP_ROUTES.WAITLIST],
      [CanonicalUserState.NEEDS_ONBOARDING, '/start?fresh_signup=true'],
      [CanonicalUserState.ACTIVE, APP_ROUTES.DASHBOARD],
      [CanonicalUserState.BANNED, APP_ROUTES.UNAVAILABLE],
      [CanonicalUserState.USER_CREATION_FAILED, APP_ROUTES.USER_CREATION_ERROR],
    ])('maps %s to the expected auth-route redirect', (state, expected) => {
      expect(getAuthenticatedAuthRouteRedirect(state)).toBe(expected);
    });

    it('does not redirect active users back to auth entry routes', () => {
      expect(
        getAuthenticatedAuthRouteRedirect(CanonicalUserState.ACTIVE, {
          redirectUrl: `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.SIGNIN}`,
        })
      ).toBe(APP_ROUTES.DASHBOARD);
    });

    it('keeps banned users from redeeming waitlist invite redirects', () => {
      expect(
        getAuthenticatedAuthRouteRedirect(CanonicalUserState.BANNED, {
          redirectUrl: '/waitlist/invite?token=secure-token',
        })
      ).toBe(APP_ROUTES.UNAVAILABLE);
    });

    it('maps client auth-entry redirects to dashboard by default', () => {
      expect(
        getClientAuthenticatedAuthEntryRedirect(new URLSearchParams())
      ).toBe(APP_ROUTES.DASHBOARD);
    });

    it('preserves safe redirect_url values for client auth-entry redirects', () => {
      expect(
        getClientAuthenticatedAuthEntryRedirect(
          new URLSearchParams('redirect_url=%2Fapp%2Fsettings')
        )
      ).toBe('/app/settings');
    });

    it('does not loop client auth-entry redirects back to /signin', () => {
      expect(
        getClientAuthenticatedAuthEntryRedirect(
          new URLSearchParams(
            `redirect_url=${encodeURIComponent(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.SIGNIN}`)}`
          )
        )
      ).toBe(APP_ROUTES.DASHBOARD);
    });
  });

  describe('chat-first waitlist recovery (JOV-5001)', () => {
    const allStates = Object.values(CanonicalUserState);

    it.each([
      [CanonicalUserState.UNAUTHENTICATED, APP_ROUTES.START],
      [CanonicalUserState.NEEDS_DB_USER, APP_ROUTES.START],
      [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION, APP_ROUTES.START],
      [CanonicalUserState.WAITLIST_PENDING, null],
      [CanonicalUserState.NEEDS_ONBOARDING, APP_ROUTES.START],
      [CanonicalUserState.ACTIVE, APP_ROUTES.DASHBOARD],
      [CanonicalUserState.BANNED, APP_ROUTES.UNAVAILABLE],
      [CanonicalUserState.USER_CREATION_FAILED, APP_ROUTES.USER_CREATION_ERROR],
    ])('maps %s on /waitlist to %s', (state, expected) => {
      expect(getWaitlistRouteRedirect(state)).toBe(expected);
    });

    it.each(
      allStates
    )('does not bounce %s in a /start ↔ /waitlist redirect loop', state => {
      const startRedirect = getStartRouteRedirect(state);
      const waitlistRedirect = getWaitlistRouteRedirect(state);
      const loops =
        startRedirect === APP_ROUTES.WAITLIST &&
        waitlistRedirect === APP_ROUTES.START;
      expect(loops).toBe(false);
    });

    it('projects pre-receipt waitlist states as onboarding, not waitlist, for proxy', () => {
      expect(
        toProxyUserState(CanonicalUserState.NEEDS_WAITLIST_SUBMISSION)
      ).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
      expect(toProxyUserState(CanonicalUserState.WAITLIST_PENDING)).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });
      expect(toProxyUserState(CanonicalUserState.NEEDS_DB_USER)).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });
  });
});
