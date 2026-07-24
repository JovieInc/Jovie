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

function matchesExactRoute(
  pathname: string | null,
  ...routes: readonly string[]
): boolean {
  if (!pathname) return false;
  return routes.some(route => pathname === route);
}

function matchesRoutePrefix(
  pathname: string | null,
  ...routes: readonly string[]
): boolean {
  if (!pathname) return false;
  return routes.some(
    route => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function matchesNestedRoute(
  pathname: string | null,
  ...routes: readonly string[]
): boolean {
  if (!pathname) return false;
  return routes.some(route => pathname.startsWith(`${route}/`));
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
  return (
    matchesExactRoute(pathname, APP_ROUTES.DASHBOARD) ||
    matchesRoutePrefix(pathname, APP_ROUTES.CHAT) ||
    matchesRoutePrefix(pathname, APP_ROUTES.CHATS) ||
    matchesRoutePrefix(pathname, APP_ROUTES.THREADS)
  );
}

export function isThreadsShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.CHATS, APP_ROUTES.THREADS);
}

export function isReleasesShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(
    pathname,
    APP_ROUTES.RELEASES,
    APP_ROUTES.DASHBOARD_RELEASES
  );
}

export function isLyricsShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.LYRICS);
}

export function isLibraryShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(
    pathname,
    APP_ROUTES.LIBRARY,
    APP_ROUTES.DASHBOARD_LIBRARY,
    APP_ROUTES.LEGACY_DASHBOARD_LIBRARY
  );
}

export function isTasksShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(
    pathname,
    APP_ROUTES.TASKS,
    APP_ROUTES.DASHBOARD_TASKS
  );
}

export function isInsightsShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.INSIGHTS);
}

export function isPresenceShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.PRESENCE);
}

export function isAudienceShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(
    pathname,
    APP_ROUTES.AUDIENCE,
    APP_ROUTES.DASHBOARD_AUDIENCE
  );
}

export function isCalendarShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.CALENDAR);
}

function isDashboardSubRoute(pathname: string | null): boolean {
  return matchesNestedRoute(pathname, APP_ROUTES.LEGACY_DASHBOARD);
}

export function isSettingsShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.SETTINGS);
}

function isLightweightShellRoute(pathname: string | null): boolean {
  return (
    isChatShellRoute(pathname) ||
    isThreadsShellRoute(pathname) ||
    isReleasesShellRoute(pathname) ||
    isLyricsShellRoute(pathname) ||
    isLibraryShellRoute(pathname) ||
    isTasksShellRoute(pathname) ||
    isInsightsShellRoute(pathname) ||
    isPresenceShellRoute(pathname) ||
    isAudienceShellRoute(pathname) ||
    isCalendarShellRoute(pathname) ||
    isDashboardSubRoute(pathname) ||
    isSettingsShellRoute(pathname)
  );
}

export function shouldUseEssentialShellData(pathname: string | null): boolean {
  return isLightweightShellRoute(pathname);
}

export function shouldRedirectToOnboarding(pathname: string | null): boolean {
  return (
    isChatShellRoute(pathname) ||
    isThreadsShellRoute(pathname) ||
    isReleasesShellRoute(pathname) ||
    isLyricsShellRoute(pathname) ||
    isLibraryShellRoute(pathname) ||
    isTasksShellRoute(pathname) ||
    isInsightsShellRoute(pathname) ||
    isPresenceShellRoute(pathname) ||
    isAudienceShellRoute(pathname) ||
    isCalendarShellRoute(pathname) ||
    isDashboardSubRoute(pathname)
  );
}
