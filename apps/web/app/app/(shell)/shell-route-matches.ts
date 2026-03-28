import { APP_ROUTES } from '@/constants/routes';

export function resolveAppShellRequestPath(
  nextUrlHeader: string | null
): string | null {
  if (!nextUrlHeader) {
    return null;
  }

  try {
    return new URL(nextUrlHeader, 'https://jovie.local').pathname;
  } catch {
    return null;
  }
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
  return (
    pathname === APP_ROUTES.RELEASES ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES
  );
}

export function shouldUseEssentialShellData(pathname: string | null): boolean {
  return isChatShellRoute(pathname) || isReleasesShellRoute(pathname);
}

export function shouldRedirectToOnboarding(pathname: string | null): boolean {
  return isChatShellRoute(pathname) || isReleasesShellRoute(pathname);
}
