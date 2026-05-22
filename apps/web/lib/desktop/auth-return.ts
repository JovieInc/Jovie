import { APP_ROUTES } from '@/constants/routes';

export const DESKTOP_RETURN_PARAM = 'desktop_return';
export const DESKTOP_AUTH_RETURN_PATH = '/auth-return';
export const DESKTOP_AUTH_HANDOFF_PATH = '/desktop-auth';
export const DESKTOP_AUTH_URL_PARAM = 'auth_url';
export const JOVIE_AUTH_RETURN_PROTOCOL_URL = 'jovie://auth-return';

const AUTH_ROUTE_PREFIXES = [
  APP_ROUTES.SIGNIN,
  APP_ROUTES.SIGNUP,
  '/sign-in',
  '/sign-up',
  '/sso-callback',
  DESKTOP_AUTH_RETURN_PATH,
  DESKTOP_AUTH_HANDOFF_PATH,
  '/mobile-auth-return',
  '/__clerk',
  '/clerk',
  '/api',
] as const;

const DESKTOP_AUTH_ROUTE_PREFIXES = [
  APP_ROUTES.SIGNIN,
  APP_ROUTES.SIGNUP,
  '/sign-in',
  '/sign-up',
  '/sso-callback',
] as const;

interface SearchParamReader {
  get(key: string): string | null;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function sanitizeDesktopReturnRoute(
  route: string | null | undefined
): string | null {
  if (!route) return null;
  if (!route.startsWith('/') || route.startsWith('//')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(route);
  } catch {
    return null;
  }

  if (decoded.includes('\\') || decoded.startsWith('//')) return null;

  let parsed: URL;
  try {
    parsed = new URL(route, 'https://jov.ie');
  } catch {
    return null;
  }

  const normalized = `${parsed.pathname}${parsed.search}`;
  if (normalized === '/') return null;

  if (
    AUTH_ROUTE_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  ) {
    return null;
  }

  return normalized;
}

export function getDesktopReturnRoute(
  searchParams: SearchParamReader,
  fallbackRoute: string
): string {
  return (
    sanitizeDesktopReturnRoute(searchParams.get(DESKTOP_RETURN_PARAM)) ??
    sanitizeDesktopReturnRoute(fallbackRoute) ??
    APP_ROUTES.DASHBOARD
  );
}

export function buildDesktopCallbackFallbackRedirectUrl(
  searchParams: SearchParamReader,
  fallbackRoute: string
): string {
  const desktopReturn = sanitizeDesktopReturnRoute(
    searchParams.get(DESKTOP_RETURN_PARAM)
  );

  if (desktopReturn) {
    return buildDesktopAuthReturnPath(desktopReturn);
  }

  return sanitizeDesktopReturnRoute(fallbackRoute) ?? APP_ROUTES.DASHBOARD;
}

export function buildDesktopAuthReturnPath(route: string): string {
  const sanitizedRoute =
    sanitizeDesktopReturnRoute(route) ?? APP_ROUTES.DASHBOARD;
  const url = new URL(DESKTOP_AUTH_RETURN_PATH, 'https://jov.ie');
  url.searchParams.set('route', sanitizedRoute);
  return `${url.pathname}${url.search}`;
}

export function buildDesktopAuthDeepLink(route: string): string {
  const sanitizedRoute =
    sanitizeDesktopReturnRoute(route) ?? APP_ROUTES.DASHBOARD;
  const url = new URL(JOVIE_AUTH_RETURN_PROTOCOL_URL);
  url.searchParams.set('route', sanitizedRoute);
  return url.toString();
}

export function buildAuthRouteUrlWithDesktopReturn(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://jov.ie');
  const desktopReturn = sanitizeDesktopReturnRoute(
    searchParams.get(DESKTOP_RETURN_PARAM)
  );

  if (desktopReturn) {
    routeUrl.searchParams.set(DESKTOP_RETURN_PARAM, desktopReturn);
  }

  return routeUrl.pathname + routeUrl.search;
}

export function sanitizeDesktopAuthUrl(
  rawUrl: string | null | undefined,
  appOrigin: string
): string | null {
  if (!rawUrl) return null;

  let parsed: URL;
  let origin: URL;
  try {
    origin = new URL(appOrigin);
    parsed = new URL(rawUrl, origin);
  } catch {
    return null;
  }

  if (parsed.origin !== origin.origin) return null;
  if (
    !DESKTOP_AUTH_ROUTE_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  ) {
    return null;
  }

  const desktopReturn = sanitizeDesktopReturnRoute(
    parsed.searchParams.get(DESKTOP_RETURN_PARAM)
  );
  if (!desktopReturn) return null;

  parsed.searchParams.set(DESKTOP_RETURN_PARAM, desktopReturn);
  return parsed.toString();
}
