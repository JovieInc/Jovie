import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  canAccessAppShell,
  getAuthenticatedAuthRouteRedirect,
  getClientAuthenticatedAuthEntryRedirect,
  getStartRouteRedirect,
} from '@/lib/auth/access-route-redirect';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

describe('access route matrix (JOV-3087)', () => {
  describe('admitted / waitlisted / signed-out alignment', () => {
    it.each([
      [CanonicalUserState.UNAUTHENTICATED, false, null],
      [CanonicalUserState.NEEDS_DB_USER, false, null],
      [
        CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
        false,
        APP_ROUTES.WAITLIST,
      ],
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
      [CanonicalUserState.NEEDS_DB_USER, '/start'],
      [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION, APP_ROUTES.WAITLIST],
      [CanonicalUserState.WAITLIST_PENDING, APP_ROUTES.WAITLIST],
      [CanonicalUserState.NEEDS_ONBOARDING, '/start'],
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
});
