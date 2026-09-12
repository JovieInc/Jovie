import { APP_ROUTES } from '@/constants/routes';

import { normalizeAuthClaimHandle } from './auth-shell-intent';
import { readAuthOfferHandoff } from './auth-shell-offer';
import { sanitizeRedirectUrl } from './constants';

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
 * `redirect_url`, claim `handle`, and paid-offer handoff (plan + interval +
 * artist). Other search params are dropped so oauth errors and emails do
 * not leak across modes.
 */
export function buildAuthRouteUrl(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://n');
  const handle = normalizeAuthClaimHandle(searchParams.get('handle'));
  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));
  const offer = readAuthOfferHandoff(searchParams);

  if (handle) {
    routeUrl.searchParams.set('handle', handle);
  }

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  if (offer) {
    routeUrl.searchParams.set('plan', offer.plan);
    if (offer.interval) {
      routeUrl.searchParams.set('interval', offer.interval);
    }
    if (offer.artist) {
      routeUrl.searchParams.set('artist_name', offer.artist);
    }
  }

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
