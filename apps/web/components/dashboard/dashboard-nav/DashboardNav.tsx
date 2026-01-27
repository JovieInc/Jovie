'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import {
  adminNavigation,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import type { DashboardNavProps, NavItem } from './types';

const PROFILE_HREF = '/app/dashboard/profile';
const ADMIN_BASE_HREF = '/app/admin';

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === ADMIN_BASE_HREF) {
    return false;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);

  // Debug: track isAdmin changes in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DashboardNav] isAdmin changed:', isAdmin);
    }
  }, [isAdmin]);

  const username =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username;
  const publicProfileHref = username ? `/${username}` : undefined;

  // Memoize profile actions to prevent creating new JSX on every render
  const profileActions = useMemo(
    () =>
      publicProfileHref ? (
        <ProfileMenuActions publicProfileHref={publicProfileHref} />
      ) : null,
    [publicProfileHref]
  );

  // Memoize filtered items to prevent creating new arrays on every render
  // Note: Tour dates is now always visible (unflagged)
  const primaryItems = useMemo(
    () =>
      primaryNavigation.filter(item => {
        if (item.id === 'contacts' && !contactsGate.value) return false;
        return true;
      }),
    [contactsGate.value]
  );

  const secondaryItems = secondaryNavigation;

  const isInSettings = pathname.startsWith('/app/settings');

  // Memoize nav sections to prevent creating new objects on every render
  const navSections = useMemo(
    () =>
      isInSettings
        ? [{ key: 'settings', items: settingsNavigation }]
        : [
            { key: 'primary', items: primaryItems },
            { key: 'secondary', items: secondaryItems },
          ],
    [isInSettings, primaryItems, secondaryItems]
  );

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem) => {
      const isActive = isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];
      const isProfileItem = item.href === PROFILE_HREF;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          actions={isProfileItem ? profileActions : null}
        />
      );
    },
    [pathname, profileActions]
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: NavItem[]) => (
      <SidebarMenu>{items.map(item => renderNavItem(item))}</SidebarMenu>
    ),
    [renderNavItem]
  );

  return (
    <nav className='flex flex-1 flex-col' aria-label='Dashboard navigation'>
      <SidebarGroup className='mb-1'>
        <SidebarGroupContent className='space-y-3'>
          {navSections.map((section, index) => (
            <div key={section.key} data-nav-section>
              {/* Section divider for visual separation (except for first section) */}
              {index > 0 && (
                <div className='mb-1.5 border-t border-sidebar-border/50' />
              )}
              {renderSection(section.items)}
            </div>
          ))}
        </SidebarGroupContent>
      </SidebarGroup>
      {isAdmin && !isInSettings && (
        <div className='mt-3 pt-3 border-t border-sidebar-border/50'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {renderSection(adminNavigation)}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
