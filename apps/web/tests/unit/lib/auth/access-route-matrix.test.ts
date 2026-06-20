import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  canAccessAppShell,
  getAuthenticatedAuthRouteRedirect,
  getStartRouteRedirect,
} from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  resolveCanonicalState,
  toProxyUserState,
} from '@/lib/auth/canonical-user-state';

describe('access route matrix (JOV-3087)', () => {
  describe('admitted / waitlisted / signed-out alignment', () => {
    it('routes admitted onboarding users away from signin and allows app + start', () => {
      const state = CanonicalUserState.NEEDS_ONBOARDING;

      expect(getAuthenticatedAuthRouteRedirect(state)).toBe(
        '/start?fresh_signup=true'
      );
      expect(canAccessAppShell(state)).toBe(true);
      expect(getStartRouteRedirect(state)).toBeNull();
    });

    it('routes waitlisted users to /waitlist from signin, start, and app shell', () => {
      const state = CanonicalUserState.WAITLIST_PENDING;

      expect(getAuthenticatedAuthRouteRedirect(state)).toBe(
        APP_ROUTES.WAITLIST
      );
      expect(canAccessAppShell(state)).toBe(false);
      expect(getStartRouteRedirect(state)).toBe(APP_ROUTES.WAITLIST);
    });

    it('keeps signed-out visitors on public entry routes', () => {
      const state = CanonicalUserState.UNAUTHENTICATED;

      expect(getStartRouteRedirect(state)).toBeNull();
      expect(canAccessAppShell(state)).toBe(false);
    });

    it('routes active users to the dashboard from signin and start', () => {
      const state = CanonicalUserState.ACTIVE;

      expect(getAuthenticatedAuthRouteRedirect(state)).toBe(
        APP_ROUTES.DASHBOARD
      );
      expect(canAccessAppShell(state)).toBe(true);
      expect(getStartRouteRedirect(state)).toBe(APP_ROUTES.DASHBOARD);
    });

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
      [CanonicalUserState.NEEDS_DB_USER, '/start?fresh_signup=true'],
      [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION, APP_ROUTES.WAITLIST],
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
  });

  describe('proxy projection matches canonical resolver', () => {
    it('maps admitted waitlist_approved users to onboarding, not waitlist', () => {
      const canonical = resolveCanonicalState({
        isAuthenticated: true,
        hasDbUser: true,
        userStatus: 'waitlist_approved',
        deletedAt: null,
        waitlistGateEnabled: true,
        profile: null,
      });

      expect(canonical).toBe(CanonicalUserState.NEEDS_ONBOARDING);
      expect(toProxyUserState(canonical)).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('maps missing DB users to onboarding intake instead of waitlist', () => {
      const canonical = resolveCanonicalState({
        isAuthenticated: true,
        hasDbUser: false,
        userStatus: null,
        deletedAt: null,
        waitlistGateEnabled: true,
        profile: null,
      });

      expect(canonical).toBe(CanonicalUserState.NEEDS_DB_USER);
      expect(toProxyUserState(canonical)).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
        isBanned: false,
      });
    });

    it('maps waitlist_pending users to waitlist gating', () => {
      const canonical = resolveCanonicalState({
        isAuthenticated: true,
        hasDbUser: true,
        userStatus: 'waitlist_pending',
        deletedAt: null,
        waitlistGateEnabled: true,
        profile: null,
      });

      expect(canonical).toBe(CanonicalUserState.WAITLIST_PENDING);
      expect(toProxyUserState(canonical)).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
        isBanned: false,
      });
    });
  });
});
