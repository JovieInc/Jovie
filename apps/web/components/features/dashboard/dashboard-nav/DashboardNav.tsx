'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { env } from '@/lib/env-client';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useReleasesQuery } from '@/lib/queries';
import {
  adminNavigationSections,
  artistSettingsNavigation,
  primaryNavigation,
  userSettingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import type { DashboardNavProps, NavItem } from './types';

const RecentChats = dynamic(
  () => import('./RecentChats').then(mod => ({ default: mod.RecentChats })),
  {
    ssr: false,
    loading: () => (
      <div className='px-2 py-1 text-sm text-secondary-token animate-pulse'>
        Loading threads…
      </div>
    ),
  }
);

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
  const router = useRouter();
  const threadsEnabled = useCodeFlag('THREADS_ENABLED');
  const { isOpen: isPreviewOpen, open: openPreviewPanel } =
    usePreviewPanelState();

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
  const profileId = selectedProfile?.id ?? '';
  const { data: releases } = useReleasesQuery(profileId);
  const releaseCount = releases?.length ?? 0;

  const primaryItems = useMemo(() => {
    return primaryNavigation.map(item => {
      if (item.id === 'profile' && artistName) {
        return { ...item, name: artistName };
      }
      if (item.id === 'releases' && releaseCount > 0) {
        return { ...item, badge: releaseCount };
      }
      return item;
    });
  }, [artistName, releaseCount]);

  const isDemo = pathname === APP_ROUTES.DEMO;
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);

  // Settings nav: "General" (user) and artist name (or "Artist") groups
  const artistSettingsLabel = artistName || 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode
  const navSections = useMemo(
    () => [{ key: 'primary', items: primaryItems }],
    [primaryItems]
  );

  // Profile nav item opens the preview drawer instead of navigating to a separate page.
  // If already on a chat route, just opens the drawer; otherwise navigates first.
  const handleProfileClick = useCallback(() => {
    const isOnChat = pathname.startsWith(APP_ROUTES.CHAT);
    if (isOnChat) {
      openPreviewPanel();
    } else {
      router.push(APP_ROUTES.CHAT);
      queueMicrotask(() => openPreviewPanel());
    }
  }, [pathname, openPreviewPanel, router]);

  // In demo mode, intercept nav clicks for tabs without demo data
  const handleDemoNavClick = useCallback((item: NavItem) => {
    toast.info(`${item.name} is not available in demo mode`);
  }, []);

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem, _index: number) => {
      const isProfileItem = item.id === 'profile';
      const isReleasesItem = item.id === 'releases';
      const isActive = isProfileItem
        ? isPreviewOpen && pathname.startsWith(APP_ROUTES.CHAT)
        : isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];

      // In demo mode, only Releases has real content — intercept all other nav clicks
      const demoUnavailable = isDemo && !isReleasesItem;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          actions={isProfileItem ? profileActions : null}
          onClick={
            demoUnavailable
              ? () => handleDemoNavClick(item)
              : isProfileItem
                ? handleProfileClick
                : undefined
          }
        />
      );
    },
    [
      pathname,
      profileActions,
      handleProfileClick,
      handleDemoNavClick,
      isPreviewOpen,
      isDemo,
    ]
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: NavItem[]) => (
      <SidebarMenu className='gap-px'>
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
        <SidebarGroup className='mb-0.5'>
          <SidebarGroupLabel className='px-2 text-2xs tracking-tight text-sidebar-muted [font-weight:var(--font-weight-nav)]'>
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent className='space-y-px'>
            {navSections.map((section, index) => (
              <div key={section.key} data-nav-section>
                {/* Section divider for visual separation (except for first section) */}
                {index > 0 && (
                  <div className='my-1 mx-2 border-t border-sidebar-border/70' />
                )}
                {renderSection(section.items)}
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {!isInSettings && threadsEnabled && !env.IS_E2E && (
        <div className='mt-3'>
          <RecentChats />
        </div>
      )}

      {isAdmin && !isInSettings && (
        <div data-testid='admin-nav-section' className='mt-2.5'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            <div className='space-y-1.5'>
              {adminNavigationSections.map((section, index) => (
                <div key={section.label} data-admin-section={section.label}>
                  {index > 0 ? (
                    <div className='my-1 mx-2 border-t border-sidebar-border/70' />
                  ) : null}
                  <p className='px-2 pb-0.5 text-[10px] uppercase tracking-[0.08em] text-sidebar-muted/85 group-data-[collapsible=icon]:hidden'>
                    {section.label}
                  </p>
                  {renderSection(section.items)}
                </div>
              ))}
            </div>
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
