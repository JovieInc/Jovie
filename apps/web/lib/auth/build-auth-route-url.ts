import { APP_ROUTES } from '@/constants/routes';

import { normalizeAuthClaimHandle } from './auth-shell-intent';
import { sanitizeAuthStateParam } from './central-auth-routing';
import { sanitizeRedirectUrl } from './constants';
import {
  readAuthOfferArtistFromParams,
  readAuthOfferIntervalFromParams,
  validatePlan,
} from './plan-intent';

/**
 * Default post-auth destination for sign-up flows when no redirect_url is set.
 */
export function getDefaultSignUpFallbackRedirectUrl(): string {
  return APP_ROUTES.START;
}

interface SearchParamReader {
  get(key: string): string | null;
}

/**
 * Builds a cross-link between auth routes while forwarding the sanitized
 * `redirect_url`, claim `handle`, native state and normalized offer values.
 * Other search params are dropped so oauth errors and emails do not leak
 * across modes.
 */
export function buildAuthRouteUrl(
  pathname: string,
  searchParams: SearchParamReader,
  options?: { readonly omit?: readonly string[] }
): string {
  const omitted = new Set(options?.omit);
  const get = (key: string) =>
    omitted.has(key) ? null : searchParams.get(key);
  const routeUrl = new URL(pathname, 'https://n');
  const handle = normalizeAuthClaimHandle(get('handle'));
  const redirectUrl = sanitizeRedirectUrl(get('redirect_url'));

  if (handle) {
    routeUrl.searchParams.set('handle', handle);
  }

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  const plan = validatePlan(get('plan'));
  if (plan) routeUrl.searchParams.set('plan', plan);
  const interval = readAuthOfferIntervalFromParams({ get });
  if (plan && interval) routeUrl.searchParams.set('interval', interval);
  const artist = readAuthOfferArtistFromParams({ get });
  if (artist) routeUrl.searchParams.set('artist_name', artist);
  const authState = sanitizeAuthStateParam(get('auth_state'));
  if (authState) routeUrl.searchParams.set('auth_state', authState);
  return routeUrl.pathname + routeUrl.search;
}

/**
 * Builds an auth route for protected-path redirects while preserving the
 * current in-app pathname and search params as a sanitized redirect target.
 */
export function buildProtectedAuthRedirectUrl(
  pathname: string,
  requestedPathname: string,
  requestedSearch = ''
): string {
  const routeUrl = new URL(pathname, 'https://n');
  const redirectUrl =
    sanitizeRedirectUrl(`${requestedPathname}${requestedSearch}`) ??
    sanitizeRedirectUrl(requestedPathname);

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  return routeUrl.pathname + routeUrl.search;
}
