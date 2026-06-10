import { APP_ROUTES } from '@/constants/routes';

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
 * Builds a cross-link between auth routes while forwarding only the sanitized
 * `redirect_url` value. Other search params are intentionally dropped.
 */
export function buildAuthRouteUrl(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://n');
  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
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
