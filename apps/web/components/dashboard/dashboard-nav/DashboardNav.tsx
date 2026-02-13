'use client';

import { Badge } from '@jovie/ui/atoms/badge';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import {
  adminNavigation,
  artistSettingsNavigation,
  primaryNavigation,
  userSettingsNavigation,
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

  const genres = selectedProfile?.genres ?? [];
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);

  // Settings nav: "General" (user) and artist name (or "Artist") groups
  const artistSettingsLabel = artistName || 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode
  const navSections = useMemo(
    () => [{ key: 'primary', items: primaryItems }],
    [primaryItems]
  );

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem, _index: number) => {
      const isProfileItem = item.id === 'profile';
      const isActive = isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];

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
      <SidebarMenu>
        {items.map((item, index) => renderNavItem(item, index))}
      </SidebarMenu>
    ),
    [renderNavItem]
  );

  return (
    <nav className='flex flex-1 flex-col' aria-label='Dashboard navigation'>
      {isInSettings ? (
        <>
          <SidebarCollapsibleGroup label='General' defaultOpen>
            {renderSection(userSettingsNavigation)}
          </SidebarCollapsibleGroup>
          <SidebarCollapsibleGroup label={artistSettingsLabel} defaultOpen>
            {renderSection(artistSettingsNavigation)}
          </SidebarCollapsibleGroup>
        </>
      ) : (
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
      )}

      {!isInSettings && genres.length > 0 && (
        <div className='mt-1.5 pt-1.5 mx-1 border-t border-default/50 group-data-[collapsible=icon]:hidden'>
          <SidebarCollapsibleGroup label='Genres' defaultOpen>
            <div className='flex flex-wrap gap-1.5 px-2 py-1'>
              {genres.map(genre => (
                <Badge key={genre} variant='secondary' size='sm'>
                  {genre}
                </Badge>
              ))}
            </div>
          </SidebarCollapsibleGroup>
        </div>
      )}

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
