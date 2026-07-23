import { APP_ROUTES } from '@/constants/routes';

const LIBRARY_ROUTE_ROOTS = [
  APP_ROUTES.LIBRARY,
  APP_ROUTES.LEGACY_DASHBOARD_LIBRARY,
  APP_ROUTES.RELEASES,
  APP_ROUTES.DASHBOARD_RELEASES,
] as const;

/**
 * Library owns both the canonical asset surface and release workspaces,
 * including their legacy aliases and nested release-task routes.
 */
export function isLibraryNavigationRoute(pathname: string): boolean {
  const normalizedPathname =
    pathname === '/' ? pathname : pathname.replace(/\/$/, '');

  return LIBRARY_ROUTE_ROOTS.some(
    route =>
      normalizedPathname === route || normalizedPathname.startsWith(`${route}/`)
  );
}
