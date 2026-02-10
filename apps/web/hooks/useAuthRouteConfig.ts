'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import {
  adminNavigation,
  primaryNavigation,
  settingsNavigation,
} from '@/components/dashboard/dashboard-nav/config';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { APP_ROUTES } from '@/constants/routes';
import { getBreadcrumbLabel } from '@/lib/constants/breadcrumb-labels';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthRouteConfig {
  section: 'admin' | 'dashboard' | 'settings';
  navigation: NavItem[];
  breadcrumbs: DashboardBreadcrumbItem[];
  showMobileTabs: boolean;
  headerAction: ReactNode;
  isTableRoute: boolean;
}

/**
 * useAuthRouteConfig - Encapsulates ALL routing logic for post-auth pages
 *
 * Returns configuration for AuthShell based on current route:
 * - Section detection (admin/dashboard/settings)
 * - Navigation items
 * - UI feature flags
 * - Breadcrumb generation
 * - Header actions
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

  // Build navigation based on section
  const navigation = useMemo(() => {
    switch (section) {
      case 'admin':
        return adminNavigation;
      case 'settings':
        return settingsNavigation;
      case 'dashboard':
      default:
        return primaryNavigation;
    }
  }, [section]);

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

  // Header action will be determined by AuthShellWrapper based on route type
  const headerAction = null;

  return {
    section,
    navigation,
    breadcrumbs,
    showMobileTabs,
    headerAction,
    isTableRoute,
  };
}
