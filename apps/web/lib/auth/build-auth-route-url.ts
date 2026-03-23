import { sanitizeRedirectUrl } from './constants';

interface SearchParamReader {
  get(key: string): string | null;
}

export function buildAuthRouteUrl(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://jov.ie');
  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  return routeUrl.pathname + routeUrl.search;
}
