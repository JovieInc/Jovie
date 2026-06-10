import {
  AUTH_CALLBACK_PATH,
  AUTH_STATE_PARAM,
  buildAuthCallbackPath,
} from '@jovie/auth-routing';
import { APP_ROUTES } from '@/constants/routes';

interface SearchParamReader {
  get(key: string): string | null;
}

const AUTH_STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

/**
 * Routes that must pass through proxy user-state redirects so native auth
 * handoffs can reach their route handlers for authenticated users.
 */
export const CENTRAL_AUTH_PASS_THROUGH_ROUTES = [
  APP_ROUTES.AUTH_START,
  APP_ROUTES.AUTH_CALLBACK,
  APP_ROUTES.LEGACY_APP_AUTH_CALLBACK,
] as const;

export const CENTRAL_AUTH_CALLBACK_ROUTES = [
  APP_ROUTES.AUTH_CALLBACK,
  APP_ROUTES.LEGACY_APP_AUTH_CALLBACK,
  APP_ROUTES.SSO_CALLBACK,
  APP_ROUTES.SIGNUP_SSO_CALLBACK,
  APP_ROUTES.SIGNIN_SSO_CALLBACK,
  APP_ROUTES.SIGNUP_HYPHEN_SSO_CALLBACK,
  APP_ROUTES.SIGNIN_HYPHEN_SSO_CALLBACK,
] as const;

export function sanitizeAuthStateParam(
  state: string | null | undefined
): string | null {
  if (!state || !AUTH_STATE_PATTERN.test(state)) return null;
  return state;
}

export function getCentralAuthCallbackPath(
  searchParams: SearchParamReader
): string | null {
  const authState = sanitizeAuthStateParam(searchParams.get(AUTH_STATE_PARAM));
  return authState ? buildAuthCallbackPath(authState) : null;
}

export function isCentralAuthCallbackPath(route: string): boolean {
  try {
    const parsed = new URL(route, 'https://jov.ie');
    return parsed.pathname === AUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

export function isCentralAuthPassThroughRoute(pathname: string): boolean {
  return CENTRAL_AUTH_PASS_THROUGH_ROUTES.includes(
    pathname as (typeof CENTRAL_AUTH_PASS_THROUGH_ROUTES)[number]
  );
}

export function isCentralAuthCallbackRoute(pathname: string): boolean {
  return CENTRAL_AUTH_CALLBACK_ROUTES.includes(
    pathname as (typeof CENTRAL_AUTH_CALLBACK_ROUTES)[number]
  );
}
