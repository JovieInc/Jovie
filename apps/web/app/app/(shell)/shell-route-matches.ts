import { APP_ROUTES } from '@/constants/routes';

function normalizeAppShellPath(pathname: string): string {
  const normalizedSegments = pathname
    .split('/')
    .filter(segment => segment.length > 0 && !/^\([^/]+\)$/.test(segment));

  if (normalizedSegments.length === 0) {
    return '/';
  }

  return `/${normalizedSegments.join('/')}`;
}

function parseAppShellPath(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  try {
    return normalizeAppShellPath(
      new URL(headerValue, 'https://jovie.local').pathname
    );
  } catch {
    return null;
  }
}

export function resolveAppShellRequestPath(
  ...headerValues: readonly (string | null)[]
): string | null {
  for (const headerValue of headerValues) {
    const pathname = parseAppShellPath(headerValue);
    if (pathname) {
      return pathname;
    }
  }

  // Next dev and some test/bypass flows do not always populate the route
  // headers that the app shell normally relies on. Defaulting to `/app`
  // preserves the onboarding redirect guard for fresh users instead of
  // falling through to a broken null-profile shell.
  return APP_ROUTES.DASHBOARD;
}

export function isChatShellRoute(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return (
    pathname === APP_ROUTES.DASHBOARD ||
    pathname === APP_ROUTES.CHAT ||
    pathname.startsWith(`${APP_ROUTES.CHAT}/`)
  );
}

export function isReleasesShellRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === APP_ROUTES.RELEASES ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES ||
    pathname.startsWith(`${APP_ROUTES.DASHBOARD_RELEASES}/`)
  );
}

function isDashboardSubRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith(`${APP_ROUTES.LEGACY_DASHBOARD}/`);
}

function isLightweightShellRoute(pathname: string | null): boolean {
  return (
    isChatShellRoute(pathname) ||
    isReleasesShellRoute(pathname) ||
    isDashboardSubRoute(pathname)
  );
}

export function shouldUseEssentialShellData(pathname: string | null): boolean {
  return isLightweightShellRoute(pathname);
}

export function shouldRedirectToOnboarding(pathname: string | null): boolean {
  return isLightweightShellRoute(pathname);
}
