import 'server-only';

import { APP_ROUTES } from '@/constants/routes';
import type { AppFlagName } from './contracts';

const SHELL_CHROME_FLAG_NAMES = [
  'DESIGN_V1',
  'STRIPE_CONNECT_ENABLED',
  'INBOX_HOME',
] as const satisfies readonly AppFlagName[];

const AUTH_ROUTE_FLAG_NAMES = [
  'DESIGN_V1',
] as const satisfies readonly AppFlagName[];

const ONBOARDING_ROUTE_FLAG_NAMES = [
  'CHAT_JANK_MONITOR',
] as const satisfies readonly AppFlagName[];

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

function isChatShellRoute(pathname: string | null): boolean {
  return (
    matchesExactRoute(pathname, APP_ROUTES.DASHBOARD) ||
    matchesRoutePrefix(
      pathname,
      APP_ROUTES.CHAT,
      APP_ROUTES.CHATS,
      APP_ROUTES.THREADS
    )
  );
}

function isReleasesShellRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(
    pathname,
    APP_ROUTES.RELEASES,
    APP_ROUTES.DASHBOARD_RELEASES
  );
}

function isReleasePlanRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.DASHBOARD_RELEASE_PLAN);
}

function isDashboardProfileRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.DASHBOARD_PROFILE);
}

function isArtistProfileSettingsRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}

function isDashboardSectionRoute(pathname: string | null): boolean {
  return matchesRoutePrefix(pathname, APP_ROUTES.LEGACY_DASHBOARD);
}

function needsAppleWalletProfilePassFlag(pathname: string | null): boolean {
  return (
    isChatShellRoute(pathname) ||
    (isDashboardSectionRoute(pathname) && !isChatShellRoute(pathname)) ||
    isArtistProfileSettingsRoute(pathname)
  );
}

function needsChatJankMonitorFlag(pathname: string | null): boolean {
  return isChatShellRoute(pathname) || isDashboardProfileRoute(pathname);
}

/**
 * Resolve the minimal runtime flag set for an authenticated app-shell route.
 * Shell chrome flags are always included; route-specific flags are added only
 * when client components on that route read them via `useAppFlag`.
 */
export function resolveAppShellRouteFlagNames(
  pathname: string | null
): readonly AppFlagName[] {
  const flagNames = new Set<AppFlagName>(SHELL_CHROME_FLAG_NAMES);

  if (needsChatJankMonitorFlag(pathname)) {
    flagNames.add('CHAT_JANK_MONITOR');
  }

  if (isReleasesShellRoute(pathname)) {
    flagNames.add('ALBUM_ART_GENERATION');
  }

  if (isReleasePlanRoute(pathname)) {
    flagNames.add('RELEASE_PLAN_DEMO');
  }

  if (needsAppleWalletProfilePassFlag(pathname)) {
    flagNames.add('APPLE_WALLET_PROFILE_PASS');
  }

  return [...flagNames];
}

export function resolveAuthRouteFlagNames(): readonly AppFlagName[] {
  return AUTH_ROUTE_FLAG_NAMES;
}

export function resolveOnboardingRouteFlagNames(): readonly AppFlagName[] {
  return ONBOARDING_ROUTE_FLAG_NAMES;
}

export function resolveStartRouteFlagNames(): readonly AppFlagName[] {
  return ONBOARDING_ROUTE_FLAG_NAMES;
}
