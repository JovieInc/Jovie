import { sanitizeRedirectUrl } from './constants';

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
