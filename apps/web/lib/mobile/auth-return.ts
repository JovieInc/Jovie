import { APP_ROUTES } from '@/constants/routes';
import { sanitizeDesktopReturnRoute } from '@/lib/desktop/auth-return';

export const MOBILE_RETURN_PARAM = 'mobile_return';
export const MOBILE_AUTH_RETURN_PATH = '/mobile-auth-return';

interface SearchParamReader {
  get(key: string): string | null;
}

function isMobileAuthRoute(route: string): boolean {
  try {
    const parsed = new URL(route, 'https://jov.ie');
    return parsed.pathname === MOBILE_AUTH_RETURN_PATH;
  } catch {
    return false;
  }
}

export function sanitizeMobileReturnRoute(
  route: string | null | undefined
): string | null {
  const sanitizedRoute = sanitizeDesktopReturnRoute(route);
  if (!sanitizedRoute || isMobileAuthRoute(sanitizedRoute)) return null;

  return sanitizedRoute;
}

export function buildMobileAuthReturnPath(route: string): string {
  const sanitizedRoute =
    sanitizeMobileReturnRoute(route) ?? APP_ROUTES.DASHBOARD;
  const url = new URL(MOBILE_AUTH_RETURN_PATH, 'https://jov.ie');
  url.searchParams.set('route', sanitizedRoute);
  return `${url.pathname}${url.search}`;
}

export function buildAuthRouteUrlWithMobileReturn(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://jov.ie');
  const mobileReturn = sanitizeMobileReturnRoute(
    searchParams.get(MOBILE_RETURN_PARAM)
  );

  if (mobileReturn) {
    routeUrl.searchParams.set(MOBILE_RETURN_PARAM, mobileReturn);
  }

  return routeUrl.pathname + routeUrl.search;
}
