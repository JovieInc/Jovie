'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import {
  getAdminGrowthViewLabel,
  getAdminPeopleViewLabel,
  isAdminGrowthView,
  isAdminPeopleView,
} from '@/constants/admin-navigation';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { getBreadcrumbLabel } from '@/lib/constants/breadcrumb-labels';
import type { AppShellMode, AppShellSection } from '@/types/app-shell';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthRouteConfig {
  section: AppShellSection;
  breadcrumbs: DashboardBreadcrumbItem[];
  showMobileTabs: boolean;
  isTableRoute: boolean;
  isArtistProfileSettings: boolean;
  isChatRoute: boolean;
  isDemoRoute: boolean;
  showChatUsageIndicator: boolean;
  isLyricsRoute: boolean;
}

function isChatThreadPath(parts: readonly string[]): boolean {
  return parts[0] === 'app' && parts[1] === 'chat' && parts.length > 2;
}

export function getDemoBreadcrumbSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const demoIndex = parts.indexOf('demo');

  if (demoIndex === -1) return '';

  const afterDemo = parts.slice(demoIndex + 1);
  if (afterDemo.length === 0) return 'releases';

  return afterDemo.at(-1) ?? 'releases';
}

/**
 * useAuthRouteConfig - Encapsulates ALL routing logic for post-auth pages
 *
 * Returns configuration for AuthShell based on current route:
 * - Section detection (admin/dashboard/settings)
 * - UI feature flags (mobile tabs, table routes)
 * - Breadcrumb generation
 *
 * Separates routing concerns from layout component.
 */
export function useAuthRouteConfig(
  mode: AppShellMode = 'customer'
): AuthRouteConfig {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemoRoute = isDemoRoutePath(pathname);

  // Detect section based on pathname
  const section = useMemo<AppShellSection>(() => {
    if (mode === 'ov') return 'ov';
    if (pathname.startsWith(APP_ROUTES.LEGACY_ADMIN)) return 'admin';
    if (pathname.startsWith(APP_ROUTES.SETTINGS)) return 'settings';
    if (
      pathname === APP_ROUTES.LIBRARY ||
      pathname.startsWith(`${APP_ROUTES.LIBRARY}/`)
    ) {
      return 'library';
    }
    return 'dashboard';
  }, [mode, pathname]);

  // Generate breadcrumbs from pathname
  const breadcrumbs = useMemo<DashboardBreadcrumbItem[]>(() => {
    if (isDemoRoute) {
      const label = getBreadcrumbLabel(getDemoBreadcrumbSegment(pathname));

      return [
        {
          label,
          href: pathname,
        },
      ];
    }

    const parts = pathname.split('/').filter(Boolean);

    // Get the last meaningful part of the path for the current page.
    // For dynamic routes like /app/chat/[uuid], use the parent segment ("chat")
    // instead of the UUID which isn't a meaningful label.
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let lastPart = parts[parts.length - 1];
    if (
      pathname === APP_ROUTES.LIBRARY &&
      searchParams.get('view') === 'releases'
    ) {
      lastPart = 'releases';
    } else if (isChatThreadPath(parts)) {
      lastPart = 'chat';
    } else if (UUID_REGEX.test(lastPart) && parts.length >= 2) {
      lastPart = parts[parts.length - 2];
    }

    if (pathname === APP_ROUTES.ADMIN_PEOPLE) {
      const adminPeopleView = searchParams.get('view');
      const label = isAdminPeopleView(adminPeopleView)
        ? getAdminPeopleViewLabel(adminPeopleView)
        : getBreadcrumbLabel('people');

      return [
        {
          label,
          href: pathname,
        },
      ];
    }

    if (pathname === APP_ROUTES.ADMIN_GROWTH) {
      const adminGrowthView = searchParams.get('view');
      const label = isAdminGrowthView(adminGrowthView)
        ? getAdminGrowthViewLabel(adminGrowthView)
        : getBreadcrumbLabel('growth');

      return [
        {
          label,
          href: pathname,
        },
      ];
    }

    // Use centralized label map with sentence case
    const label = getBreadcrumbLabel(lastPart);

    return [
      {
        label,
        href: pathname,
      },
    ];
  }, [isDemoRoute, pathname, searchParams]);

  // Customer navigation never leaks into the dedicated OV shell.
  const showMobileTabs = mode === 'customer';

  // Table routes that need different overflow behavior.
  // Memoized so downstream consumers don't re-render when navigating
  // between two non-table (or two table) routes.
  const isTableRoute = useMemo(
    () =>
      isDemoRoute ||
      pathname.includes('/creators') ||
      pathname.includes('/audience') ||
      pathname.includes('/users') ||
      pathname.includes('/waitlist') ||
      pathname.includes('/feedback') ||
      pathname.includes('/campaigns') ||
      pathname.includes('/people') ||
      pathname.includes('/growth') ||
      pathname.includes('/releases') ||
      pathname === APP_ROUTES.TOUR_DATES,
    [isDemoRoute, pathname]
  );

  // Artist profile settings page gets the preview panel sidebar
  const isArtistProfileSettings = useMemo(
    () =>
      pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE ||
      pathname.startsWith(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}/`),
    [pathname]
  );

  const isChatRoute = useMemo(
    () =>
      pathname === APP_ROUTES.CHAT ||
      pathname.startsWith(`${APP_ROUTES.CHAT}/`),
    [pathname]
  );

  const isLyricsRoute = useMemo(
    () =>
      pathname === APP_ROUTES.LYRICS ||
      Boolean(pathname?.startsWith(`${APP_ROUTES.LYRICS}/`)),
    [pathname]
  );

  return {
    section,
    breadcrumbs,
    showMobileTabs,
    isTableRoute,
    isArtistProfileSettings,
    isChatRoute,
    isDemoRoute,
    showChatUsageIndicator: isChatRoute,
    isLyricsRoute,
  };
}
