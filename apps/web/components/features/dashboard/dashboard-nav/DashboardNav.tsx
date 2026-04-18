'use client';

import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { Flagged } from '@/components/features/dev/Flagged';
import { usePendingShell } from '@/components/organisms/AuthShellWrapper';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { env } from '@/lib/env-client';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { usePlanGate } from '@/lib/queries';
import { useTaskStatsQuery } from '@/lib/queries/useTasksQuery';
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
  const normalizedPathname = (() => {
    if (
      pathname === APP_ROUTES.DASHBOARD_RELEASES ||
      pathname === APP_ROUTES.RELEASES
    ) {
      return APP_ROUTES.RELEASES;
    }
    if (pathname === APP_ROUTES.AUDIENCE) {
      return APP_ROUTES.DASHBOARD_AUDIENCE;
    }
    return pathname;
  })();

  if (
    normalizedPathname === item.href ||
    (normalizedPathname === APP_ROUTES.RELEASES &&
      item.href === APP_ROUTES.DASHBOARD_RELEASES)
  ) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === APP_ROUTES.ADMIN) {
    return false;
  }

  return normalizedPathname.startsWith(`${item.href}/`);
}

function formatTaskBadge(
  taskStats: { activeTodoCount: number } | undefined
): string | number | undefined {
  if (!taskStats || taskStats.activeTodoCount <= 0) return undefined;
  return taskStats.activeTodoCount > 99 ? '99+' : taskStats.activeTodoCount;
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const { clearPendingShell, showPendingShell } = usePendingShell();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const threadsEnabled = useCodeFlag('THREADS_ENABLED');
  const {
    isOpen: isPreviewOpen,
    open: openPreviewPanel,
    toggle: togglePreviewPanel,
  } = usePreviewPanelState();

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
  const isDemo = isDemoRoutePath(pathname);
  const { canAccessTasksWorkspace, isLoading: isPlanGateLoading } =
    usePlanGate();
  const { data: taskStats } = useTaskStatsQuery(profileId, {
    enabled: !isDemo && canAccessTasksWorkspace,
  });
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);

  // Settings nav: "General" (user) and artist name (or "Artist") groups
  const artistSettingsLabel = artistName || 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode
  const navSections = useMemo(
    () => [
      {
        key: 'primary',
        items: primaryNavigation.map(item =>
          item.id === 'tasks'
            ? {
                ...item,
                badge: (() => {
                  if (isPlanGateLoading) return undefined;
                  if (canAccessTasksWorkspace)
                    return formatTaskBadge(taskStats);
                  return (
                    <span className='rounded-full border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_90%,transparent)] px-1.5 py-0.5 text-[9px] font-[600] tracking-[0.02em] text-secondary-token'>
                      Pro
                    </span>
                  );
                })(),
              }
            : item
        ),
      },
    ],
    [canAccessTasksWorkspace, isPlanGateLoading, taskStats]
  );

  // Profile nav item opens the preview drawer instead of navigating to a separate page.
  // If already on a chat route, just opens the drawer; otherwise navigates first.
  const handleProfileClick = useCallback(() => {
    const isOnChat = pathname.startsWith(APP_ROUTES.CHAT);
    if (isOnChat) {
      togglePreviewPanel();
    } else {
      router.push(APP_ROUTES.CHAT);
      queueMicrotask(() => openPreviewPanel());
    }
  }, [pathname, togglePreviewPanel, openPreviewPanel, router]);

  // Debounced prefetch: avoid firing on fast mouse sweeps across nav items
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releasesPrefetchedProfileIdRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (
      isDemo ||
      !profileId ||
      releasesPrefetchedProfileIdRef.current === profileId ||
      pathname !== APP_ROUTES.DASHBOARD
    ) {
      return;
    }

    releasesPrefetchedProfileIdRef.current = profileId;

    // Defer the eager releases prefetch past initial dashboard paint so the
    // shell can hydrate without competing with a background chunk fetch +
    // TanStack Query warmup. Matches the hover-prefetch debounce pattern
    // used by handlePrefetch below.
    const handle = setTimeout(() => {
      router.prefetch(APP_ROUTES.DASHBOARD_RELEASES);
      void import(
        '@/features/dashboard/organisms/release-provider-matrix'
      ).catch(() => {
        releasesPrefetchedProfileIdRef.current = null;
      });
      void import('@/lib/queries/prefetch-dashboard')
        .then(({ prefetchForRoute }) =>
          prefetchForRoute('releases', queryClient, profileId)
        )
        .catch(() => {
          releasesPrefetchedProfileIdRef.current = null;
        });
    }, 300);

    return () => clearTimeout(handle);
  }, [isDemo, pathname, profileId, queryClient, router]);

  const handlePrefetch = useCallback(
    (itemId: string) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      const prefetchDelayMs = itemId === 'releases' ? 0 : 150;
      prefetchTimerRef.current = setTimeout(() => {
        if (itemId === 'releases') {
          void import(
            '@/features/dashboard/organisms/release-provider-matrix'
          ).catch(() => {});
        }
        void import('@/lib/queries/prefetch-dashboard')
          .then(({ prefetchForRoute }) =>
            prefetchForRoute(itemId, queryClient, profileId || undefined)
          )
          .catch(() => {});
      }, prefetchDelayMs);
    },
    [queryClient, profileId]
  );

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
      const renderAsButton = isProfileItem && !demoUnavailable;
      let onClick: (() => void) | undefined;
      if (demoUnavailable) onClick = () => handleDemoNavClick(item);
      else if (isProfileItem) onClick = handleProfileClick;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          prefetch={undefined}
          actions={isProfileItem ? profileActions : null}
          onClick={onClick}
          preventNavigation={demoUnavailable}
          renderAsButton={renderAsButton}
          onNavigate={
            isReleasesItem && !isActive
              ? () => showPendingShell('releases')
              : undefined
          }
          onCancelNavigate={
            isReleasesItem && !isActive
              ? () => clearPendingShell('releases')
              : undefined
          }
          onPrefetch={() => handlePrefetch(item.id)}
        />
      );
    },
    [
      pathname,
      profileActions,
      handleProfileClick,
      handleDemoNavClick,
      handlePrefetch,
      clearPendingShell,
      showPendingShell,
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
          <SidebarGroupContent className='space-y-0.5'>
            {navSections.map((section, index) => (
              <div key={section.key} data-nav-section>
                {/* Section divider for visual separation (except for first section) */}
                {index > 0 && <div className='my-1.5' />}
                {renderSection(section.items)}
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {!isInSettings && threadsEnabled && !env.IS_E2E && (
        <Flagged name='THREADS_ENABLED'>
          <div className='mt-3.5'>
            <RecentChats />
          </div>
        </Flagged>
      )}

      {isAdmin && !isInSettings && (
        <div data-testid='admin-nav-section' className='mt-3'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {adminNavigationSections.map(section => (
              <div
                key={section.label}
                className='space-y-2'
                data-admin-section={section.label}
              >
                <p className='px-2.5 pb-0.5 text-[11px] font-[560] tracking-[-0.01em] text-sidebar-muted/80 group-data-[collapsible=icon]:hidden'>
                  {section.label}
                </p>
                {renderSection(section.items)}
              </div>
            ))}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
