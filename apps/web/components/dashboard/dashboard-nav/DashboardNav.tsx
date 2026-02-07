'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import {
  adminNavigation,
  primaryNavigation,
  secondaryNavigation,
  settingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import { RecentChats } from './RecentChats';
import type { DashboardNavProps, NavItem } from './types';

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === APP_ROUTES.ADMIN) {
    return false;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();

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

  // Replace "Profile" label with artist display name when available
  const artistName = selectedProfile?.displayName;
  const primaryItems = useMemo(() => {
    if (!artistName) return primaryNavigation;
    return primaryNavigation.map(item =>
      item.id === 'profile' ? { ...item, name: artistName } : item
    );
  }, [artistName]);

  const secondaryItems = secondaryNavigation;

  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);

  // Replace "Artist" label with artist display name in settings nav
  const settingsItems = useMemo(() => {
    if (!artistName) return settingsNavigation;
    return settingsNavigation.map(item =>
      item.id === 'artist' ? { ...item, name: artistName } : item
    );
  }, [artistName]);

  // Memoize nav sections to prevent creating new objects on every render
  const navSections = useMemo(
    () =>
      isInSettings
        ? [{ key: 'settings', items: settingsItems }]
        : [
            { key: 'primary', items: primaryItems },
            { key: 'secondary', items: secondaryItems },
          ],
    [isInSettings, primaryItems, secondaryItems, settingsItems]
  );

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem, _index: number) => {
      const isActive = isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];
      const isProfileItem = item.href === APP_ROUTES.PROFILE;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          actions={isProfileItem ? profileActions : null}
        >
          {item.children && item.children.length > 0 && (
            <SidebarMenuSub>
              {item.children.map(child => (
                <SidebarMenuSubItem key={child.id}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isItemActive(pathname, child)}
                  >
                    <Link href={child.href}>
                      <child.icon className='size-4' aria-hidden='true' />
                      <span>{child.name}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          )}
        </NavMenuItem>
      );
    },
    [pathname, profileActions]
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: NavItem[]) => (
      <SidebarMenu>
        {items.map((item, index) => renderNavItem(item, index))}
      </SidebarMenu>
    ),
    [renderNavItem]
  );

  return (
    <nav className='flex flex-1 flex-col' aria-label='Dashboard navigation'>
      <SidebarGroup className='mb-1'>
        <SidebarGroupContent className='space-y-0'>
          {navSections.map((section, index) => (
            <div key={section.key} data-nav-section>
              {/* Section divider for visual separation (except for first section) */}
              {index > 0 && (
                <div className='my-1.5 mx-2 border-t border-sidebar-border/15' />
              )}
              {renderSection(section.items)}
            </div>
          ))}
        </SidebarGroupContent>
      </SidebarGroup>

      {!isInSettings && (
        <div className='mt-1.5 pt-1.5 mx-1 border-t border-default/50'>
          <RecentChats />
        </div>
      )}

      {isAdmin && !isInSettings && (
        <div data-testid='admin-nav-section'>
          <div className='my-1.5 mx-2 border-t border-sidebar-border/10' />
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {renderSection(adminNavigation)}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
