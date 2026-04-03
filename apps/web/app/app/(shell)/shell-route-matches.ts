import { APP_ROUTES } from '@/constants/routes';

function parseAppShellPath(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  try {
    return new URL(headerValue, 'https://jovie.local').pathname;
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

  return null;
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
  return pathname.startsWith(`${APP_ROUTES.DASHBOARD_OVERVIEW}/`);
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
