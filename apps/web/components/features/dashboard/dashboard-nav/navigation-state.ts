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

/** The rail's Inbox row; the header bell replaces it when it owns `/app`. */
const INBOX_ROW_ID = 'home';

/**
 * Rail destinations for the current chrome. When the header bell owns the
 * Inbox, the rail drops its Inbox row: the bell (with the unread dot) and
 * New Chat already reach `/app` (Tim 2026-11-14).
 */
export function getRailNavigation<Item extends Pick<NavItem, 'id'>>(
  items: readonly Item[],
  headerOwnsInbox: boolean
): readonly Item[] {
  return headerOwnsInbox
    ? items.filter(item => item.id !== INBOX_ROW_ID)
    : items;
}

/**
 * One selected row at a time. While a destination resolves it takes the
 * selected paint and the still-current page yields it, so `/app` never shows
 * Inbox and Audience highlighted together. `aria-current` stays on the page.
 */
export function isNavigationItemHighlighted(
  itemId: string,
  isActive: boolean,
  pendingItemId: string | undefined
): boolean {
  return pendingItemId === undefined ? isActive : pendingItemId === itemId;
}
