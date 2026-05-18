'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { usePendingShell } from '@/components/organisms/PendingShellContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import {
  type SidebarThread,
  SidebarThreadsSection,
} from '@/components/shell/SidebarThreadsSection';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useAppFlag } from '@/lib/flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { usePlanGate } from '@/lib/queries';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { useTaskStatsQuery } from '@/lib/queries/useTasksQuery';
import {
  adminNavigationSections,
  artistSettingsNavigation,
  libraryNavItem,
  newThreadNavItem,
  primaryNavigation,
  userSettingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { ProfileMenuActions } from './ProfileMenuActions';
import type { DashboardNavProps, NavItem } from './types';

const searchNavItem: NavItem = {
  name: 'Search',
  href: APP_ROUTES.CHAT,
  id: 'search',
  icon: Search,
  description: 'Search routes, releases, artists, and threads',
};

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

type ArtistWorkspaceNavSection = {
  readonly key: 'artist-workspace';
  readonly label: string;
  readonly items: NavItem[];
};

function isItemActive(pathname: string, item: NavItem): boolean {
  const normalizedPathname = (() => {
    if (
      pathname === APP_ROUTES.DASHBOARD_RELEASES ||
      pathname === APP_ROUTES.RELEASES
    ) {
      return APP_ROUTES.RELEASES;
    }
    if (
      pathname === APP_ROUTES.DASHBOARD_AUDIENCE ||
      pathname === APP_ROUTES.AUDIENCE
    ) {
      return APP_ROUTES.AUDIENCE;
    }
    return pathname;
  })();

  if (
    normalizedPathname === item.href ||
    (normalizedPathname === APP_ROUTES.RELEASES &&
      (item.href === APP_ROUTES.RELEASES ||
        item.href === APP_ROUTES.DASHBOARD_RELEASES))
  ) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === APP_ROUTES.ADMIN) {
    return false;
  }

  return normalizedPathname.startsWith(`${item.href}/`);
}

function normalizeTrailingSlash(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
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
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const shellChatLibraryEnabled = useAppFlag('SHELL_CHAT_V1');
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

  const artistName = selectedProfile?.displayName?.trim();
  const profileId = selectedProfile?.id ?? '';
  const isDemo = isDemoRoutePath(pathname);
  const { canAccessTasksWorkspace, isLoading: isPlanGateLoading } =
    usePlanGate();
  const { data: taskStats } = useTaskStatsQuery(profileId, {
    enabled: !isDemo && canAccessTasksWorkspace,
  });
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);
  const threadsVisible =
    shellChatV1Enabled &&
    !isDemo &&
    !isInSettings &&
    (isMobile ? openMobile : sidebarState === 'open');
  const {
    data: conversations,
    isError: conversationsError,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useChatConversationsQuery({
    limit: 10,
    enabled: threadsVisible,
  });

  // Settings nav: "General" (user) and artist name (or "Artist") groups
  const artistSettingsLabel = artistName || 'Artist';
  const artistWorkspaceLabel = artistName || 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode
  const { artistWorkspaceSection, navSections } = useMemo<{
    readonly artistWorkspaceSection: ArtistWorkspaceNavSection | null;
    readonly navSections: DashboardNavSection[];
  }>(() => {
    const decorateItem = (item: NavItem): NavItem =>
      item.id === 'tasks'
        ? {
            ...item,
            badge: (() => {
              if (isPlanGateLoading) return undefined;
              if (canAccessTasksWorkspace) return formatTaskBadge(taskStats);
              return (
                <span className='rounded-full border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_90%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.02em] text-secondary-token'>
                  Pro
                </span>
              );
            })(),
          }
        : item;
    const primaryItems = shellChatLibraryEnabled
      ? [
          ...primaryNavigation.slice(0, 2),
          libraryNavItem,
          ...primaryNavigation.slice(2),
        ]
      : primaryNavigation;

    if (shellChatV1Enabled) {
      const profileItem = primaryNavigation.find(item => item.id === 'profile');
      const releaseItem = primaryNavigation.find(
        item => item.id === 'releases'
      );
      const audienceItem = primaryNavigation.find(
        item => item.id === 'audience'
      );
      const tasksItem = primaryNavigation.find(item => item.id === 'tasks');

      return {
        artistWorkspaceSection: {
          key: 'artist-workspace',
          label: artistWorkspaceLabel,
          items: [profileItem, releaseItem, audienceItem]
            .filter((item): item is NavItem => Boolean(item))
            .map(decorateItem),
        },
        navSections: [
          {
            key: 'user-work',
            items: [
              newThreadNavItem,
              searchNavItem,
              ...(tasksItem ? [decorateItem(tasksItem)] : []),
              ...(shellChatLibraryEnabled ? [libraryNavItem] : []),
            ],
          },
        ],
      };
    }

    return {
      artistWorkspaceSection: null,
      navSections: [
        {
          key: 'primary',
          items: primaryItems.map(decorateItem),
        },
      ],
    };
  }, [
    artistWorkspaceLabel,
    canAccessTasksWorkspace,
    isPlanGateLoading,
    shellChatV1Enabled,
    shellChatLibraryEnabled,
    taskStats,
  ]);

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

    // Defer the eager releases prefetch past initial dashboard paint so the
    // shell can hydrate without competing with a background chunk fetch +
    // TanStack Query warmup. Matches the hover-prefetch debounce pattern
    // used by handlePrefetch below. The prefetched marker is written inside
    // the timer so a cleanup that fires before the timer runs (fast route
    // change) leaves the ref null and a later visit will retry.
    const handle = setTimeout(() => {
      releasesPrefetchedProfileIdRef.current = profileId;
      router.prefetch(APP_ROUTES.RELEASES);
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

  const handleSearchClick = useCallback(() => {
    globalThis.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
  }, []);

  const sidebarThreads = useMemo<SidebarThread[]>(
    () =>
      (conversations ?? []).map(conversation => ({
        id: conversation.id,
        href: `${APP_ROUTES.CHAT}/${encodeURIComponent(conversation.id)}`,
        title: conversation.title?.trim() || 'Untitled thread',
        status: 'complete',
        updatedAt: conversation.updatedAt,
      })),
    [conversations]
  );

  const activeThreadId = useMemo(() => {
    const chatPrefix = `${APP_ROUTES.CHAT}/`;
    if (!pathname.startsWith(chatPrefix)) return null;
    const [id] = pathname.slice(chatPrefix.length).split('/');
    return id ? decodeURIComponent(id) : null;
  }, [pathname]);

  const handleNewThread = useCallback(() => {
    router.push(APP_ROUTES.CHAT);
  }, [router]);

  const handleRetryThreads = useCallback(() => {
    void refetchConversations();
  }, [refetchConversations]);

  // Memoize renderNavItem to prevent creating new functions on every render
  const renderNavItem = useCallback(
    (item: NavItem, _index: number) => {
      const isProfileItem = item.id === 'profile';
      const isReleasesItem = item.id === 'releases';
      const isSearchItem = item.id === 'search';
      const isNewThreadItem =
        item.id === 'chat' && item.href === APP_ROUTES.CHAT;
      let isActive = false;
      if (isProfileItem) {
        isActive = isPreviewOpen && pathname.startsWith(APP_ROUTES.CHAT);
      } else if (isNewThreadItem) {
        isActive = normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT;
      } else if (!isSearchItem) {
        isActive = isItemActive(pathname, item);
      }
      const shortcut = NAV_SHORTCUTS[item.id];

      // In demo mode, only Releases has real content — intercept all other nav clicks
      const demoUnavailable = isDemo && !isReleasesItem && !isSearchItem;
      const renderAsButton =
        (isProfileItem && !demoUnavailable) || isSearchItem;
      let onClick: (() => void) | undefined;
      if (demoUnavailable) onClick = () => handleDemoNavClick(item);
      else if (isSearchItem) onClick = handleSearchClick;
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
          useShellNavItem={shellChatV1Enabled}
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
      handleSearchClick,
      clearPendingShell,
      showPendingShell,
      isPreviewOpen,
      isDemo,
      shellChatV1Enabled,
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
                {section.label ? (
                  <SidebarCollapsibleGroup
                    label={section.label}
                    defaultOpen
                    className='-mx-0.5'
                  >
                    {renderSection(section.items)}
                  </SidebarCollapsibleGroup>
                ) : (
                  renderSection(section.items)
                )}
              </div>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {threadsVisible ? (
        <div className='mt-1.5'>
          <SidebarThreadsSection
            threads={sidebarThreads}
            activeThreadId={activeThreadId}
            state={
              conversationsError
                ? 'error'
                : conversationsLoading
                  ? 'loading'
                  : 'idle'
            }
            onRetry={handleRetryThreads}
            onNewThread={handleNewThread}
            tight
            collapsed={false}
          />
        </div>
      ) : null}

      {artistWorkspaceSection ? (
        <div data-nav-section={artistWorkspaceSection.key} className='mt-3'>
          <SidebarCollapsibleGroup
            label={artistWorkspaceSection.label}
            defaultOpen
            className='-mx-0.5'
          >
            {renderSection(artistWorkspaceSection.items)}
          </SidebarCollapsibleGroup>
        </div>
      ) : null}

      {isAdmin && !isInSettings && (
        <div data-testid='admin-nav-section' className='mt-3'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {adminNavigationSections.map(section => (
              <div
                key={section.label}
                className='space-y-2'
                data-admin-section={section.label}
              >
                <p className='px-2.5 pb-0.5 text-2xs font-semibold tracking-[-0.01em] text-sidebar-muted/80 group-data-[collapsible=icon]:hidden'>
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
