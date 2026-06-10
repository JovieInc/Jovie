import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  CENTRAL_AUTH_CALLBACK_ROUTES,
  CENTRAL_AUTH_PASS_THROUGH_ROUTES,
  getCentralAuthCallbackPath,
  isCentralAuthCallbackPath,
  isCentralAuthCallbackRoute,
  isCentralAuthPassThroughRoute,
  sanitizeAuthStateParam,
} from '@/lib/auth/central-auth-routing';

describe('central auth routing', () => {
  it('sanitizes auth_state params to the shared token shape', () => {
    const validState = 'a'.repeat(32);
    expect(sanitizeAuthStateParam(validState)).toBe(validState);
    expect(sanitizeAuthStateParam('short')).toBeNull();
    expect(sanitizeAuthStateParam('bad token')).toBeNull();
  });

  it('builds central callback paths from auth_state search params', () => {
    const state = 'a'.repeat(32);
    expect(
      getCentralAuthCallbackPath({
        get: key => (key === 'auth_state' ? state : null),
      })
    ).toBe(`${APP_ROUTES.AUTH_CALLBACK}?state=${state}`);
  });

  it('recognizes central callback destinations in redirect URLs', () => {
    expect(
      isCentralAuthCallbackPath(`${APP_ROUTES.AUTH_CALLBACK}?state=abc`)
    ).toBe(true);
    expect(isCentralAuthCallbackPath(APP_ROUTES.DASHBOARD)).toBe(false);
  });

  it.each(
    CENTRAL_AUTH_PASS_THROUGH_ROUTES
  )('treats %s as a central auth pass-through route', route => {
    expect(isCentralAuthPassThroughRoute(route)).toBe(true);
  });

  it('does not treat sign-in routes as central auth pass-through routes', () => {
    expect(isCentralAuthPassThroughRoute(APP_ROUTES.SIGNIN)).toBe(false);
    expect(isCentralAuthPassThroughRoute(APP_ROUTES.SIGNUP)).toBe(false);
  });

  it.each(
    CENTRAL_AUTH_CALLBACK_ROUTES
  )('treats %s as a central auth callback route', route => {
    expect(isCentralAuthCallbackRoute(route)).toBe(true);
  });
});
