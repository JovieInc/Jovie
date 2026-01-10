'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  adminNavigation,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from '@/components/dashboard/dashboard-nav/config';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthRouteConfig {
  section: 'admin' | 'dashboard' | 'settings';
  navigation: NavItem[];
  breadcrumbs: DashboardBreadcrumbItem[];
  showMobileTabs: boolean;
  showDrawer: boolean;
  drawerWidth: number | null;
  drawerContent: ReactNode;
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
 * - Drawer configuration
 *
 * Separates routing concerns from layout component.
 */
export function useAuthRouteConfig(): AuthRouteConfig {
  const pathname = usePathname();

  // Detect section based on pathname
  const section = useMemo<'admin' | 'dashboard' | 'settings'>(() => {
    if (pathname.startsWith('/app/admin')) return 'admin';
    if (pathname.startsWith('/app/settings')) return 'settings';
    return 'dashboard';
  }, [pathname]);

  // Build navigation based on section
  const navigation = useMemo(() => {
    switch (section) {
      case 'admin':
        // Admin shows all nav: primary + secondary + admin
        return [
          ...primaryNavigation,
          ...secondaryNavigation,
          ...adminNavigation,
        ];
      case 'settings':
        return settingsNavigation;
      case 'dashboard':
      default:
        return [...primaryNavigation, ...secondaryNavigation];
    }
  }, [section]);

  // Generate breadcrumbs from pathname
  const breadcrumbs = useMemo<DashboardBreadcrumbItem[]>(() => {
    const parts = pathname.split('/').filter(Boolean);

    // Get the last part of the path for the current page
    const lastPart = parts[parts.length - 1];

    // Map path segments to readable labels
    const labelMap: Record<string, string> = {
      dashboard: 'Overview',
      admin: 'Overview',
      settings: 'Account',
      profile: 'Profile',
      contacts: 'Contacts',
      releases: 'Releases',
      audience: 'Audience',
      earnings: 'Earnings',
      waitlist: 'Waitlist',
      creators: 'Creators',
      users: 'Users',
      activity: 'Activity',
      appearance: 'Appearance',
      notifications: 'Notifications',
      branding: 'Branding',
      'ad-pixels': 'Ad Pixels',
      billing: 'Billing',
    };

    const label = labelMap[lastPart] || lastPart;

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

  // Drawer is now controlled by individual pages, not auto-shown
  const showDrawer = false;

  // Drawer configuration
  const drawerWidth = showDrawer ? 360 : null;
  const drawerContent = null; // Controlled by individual pages

  // Header action (TODO: Add theme toggle for admin, contact toggle for tables)
  const headerAction = null; // TODO: Will be populated in Phase 2

  return {
    section,
    navigation,
    breadcrumbs,
    showMobileTabs,
    showDrawer,
    drawerWidth,
    drawerContent,
    headerAction,
    isTableRoute,
  };
}
