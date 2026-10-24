import {
  canonicalSidebarNavigation,
  settingsNavItem,
  settingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import type { AppShellMode } from '@/types/app-shell';

/** Titles use the same entries as the sidebar, including query-backed tabs. */
export function getSidebarRouteLabel(
  pathname: string,
  mode: AppShellMode = 'customer'
): string | undefined {
  if (mode === 'ov') {
    const canonicalPath =
      pathname === APP_ROUTES.LEGACY_ADMIN ||
      pathname.startsWith(`${APP_ROUTES.LEGACY_ADMIN}/`)
        ? pathname.replace(APP_ROUTES.LEGACY_ADMIN, APP_ROUTES.OV)
        : pathname;
    const route =
      canonicalPath === APP_ROUTES.ADMIN_CHAT ? APP_ROUTES.OV : canonicalPath;
    return ADMIN_NAV_REGISTRY.find(item => item.href === route)?.label;
  }

  const route =
    pathname === APP_ROUTES.INSIGHTS || pathname === APP_ROUTES.AUDIENCE
      ? APP_ROUTES.CONTACTS
      : PRODUCT_ONTOLOGY.identity.compatibilityRoutes.some(
            alias => alias === pathname
          )
        ? APP_ROUTES.PRESENCE
        : PRODUCT_ONTOLOGY.work.compatibilityRoutes.some(
              alias => alias === pathname
            )
          ? APP_ROUTES.LIBRARY
          : pathname;

  return [
    ...canonicalSidebarNavigation,
    settingsNavItem,
    ...settingsNavigation,
  ].find(item => item.href.split('?')[0] === route)?.name;
}
