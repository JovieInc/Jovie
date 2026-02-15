'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { APP_ROUTES } from '@/constants/routes';
import { getBreadcrumbLabel } from '@/lib/constants/breadcrumb-labels';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthRouteConfig {
  section: 'admin' | 'dashboard' | 'settings';
  breadcrumbs: DashboardBreadcrumbItem[];
  showMobileTabs: boolean;
  isTableRoute: boolean;
  isArtistProfileSettings: boolean;
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
export function useAuthRouteConfig(): AuthRouteConfig {
  const pathname = usePathname();

  // Detect section based on pathname
  const section = useMemo<'admin' | 'dashboard' | 'settings'>(() => {
    if (pathname.startsWith(APP_ROUTES.ADMIN)) return 'admin';
    if (pathname.startsWith(APP_ROUTES.SETTINGS)) return 'settings';
    return 'dashboard';
  }, [pathname]);

  // Generate breadcrumbs from pathname
  const breadcrumbs = useMemo<DashboardBreadcrumbItem[]>(() => {
    const parts = pathname.split('/').filter(Boolean);

    // Get the last meaningful part of the path for the current page.
    // For dynamic routes like /app/chat/[uuid], use the parent segment ("chat")
    // instead of the UUID which isn't a meaningful label.
    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let lastPart = parts[parts.length - 1];
    if (UUID_REGEX.test(lastPart) && parts.length >= 2) {
      lastPart = parts[parts.length - 2];
    }

    // Use centralized label map with sentence case
    const label = getBreadcrumbLabel(lastPart);

    return [
      {
        label,
        href: pathname,
      },
    ];
  }, [pathname]);

  // Determine UI flags based on section and pathname
  const showMobileTabs = section === 'dashboard';

  // Table routes that need different overflow behavior
  const isTableRoute =
    pathname.includes('/creators') ||
    pathname.includes('/audience') ||
    pathname.includes('/users') ||
    pathname.includes('/waitlist') ||
    pathname.includes('/releases');

  // Artist profile settings page gets the preview panel sidebar
  const isArtistProfileSettings =
    pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE ||
    pathname.startsWith(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}/`);

  return {
    section,
    breadcrumbs,
    showMobileTabs,
    isTableRoute,
    isArtistProfileSettings,
  };
}
