import { APP_ROUTES } from '@/constants/routes';
import type { NavItem } from './types';

const LIBRARY_ROUTE_ROOTS = [
  APP_ROUTES.LIBRARY,
  APP_ROUTES.LEGACY_DASHBOARD_LIBRARY,
  APP_ROUTES.RELEASES,
  APP_ROUTES.DASHBOARD_RELEASES,
  APP_ROUTES.YOUTUBE_REVIVAL,
] as const;

/**
 * Work owns the canonical asset surface, release workspaces, and YouTube
 * ledger, including legacy aliases and nested release-task routes.
 */
export function isLibraryNavigationRoute(pathname: string): boolean {
  const normalizedPathname =
    pathname === '/' ? pathname : pathname.replace(/\/$/, '');

  return LIBRARY_ROUTE_ROOTS.some(
    route =>
      normalizedPathname === route || normalizedPathname.startsWith(`${route}/`)
  );
}

interface NavigationSearchParams {
  getAll(name: string): string[];
}

function normalizePathname(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
}

/**
 * Match a root navigation item without treating query-backed contextual views
 * as their entire parent workspace. Extra query params are allowed so filters
 * inside contextual links or Audience do not clear the active destination.
 */
export function isNavigationItemActive(
  item: Pick<NavItem, 'href' | 'id'>,
  pathname: string,
  searchParams: NavigationSearchParams
): boolean {
  const normalizedPathname = normalizePathname(pathname);

  if (item.id === 'home') {
    return normalizedPathname === APP_ROUTES.DASHBOARD;
  }

  if (item.id === 'library' && isLibraryNavigationRoute(pathname)) {
    return true;
  }

  if (
    item.id === 'audience' &&
    (normalizedPathname === APP_ROUTES.INSIGHTS ||
      normalizedPathname.startsWith(`${APP_ROUTES.INSIGHTS}/`))
  ) {
    return true;
  }

  const target = new URL(item.href, 'https://jovie.local');
  const targetPathname = normalizePathname(target.pathname);
  if (
    normalizedPathname !== targetPathname &&
    !normalizedPathname.startsWith(`${targetPathname}/`)
  ) {
    return false;
  }

  for (const key of new Set(target.searchParams.keys())) {
    const expected = target.searchParams.getAll(key);
    const current = searchParams.getAll(key);
    if (!expected.every(value => current.includes(value))) {
      return false;
    }
  }

  return true;
}
