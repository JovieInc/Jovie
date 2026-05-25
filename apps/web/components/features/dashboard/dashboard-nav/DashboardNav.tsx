'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { openCommandPalette } from '@/components/organisms/command-palette-events';
import { usePendingShell } from '@/components/organisms/PendingShellContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import {
  readThreadReadState,
  type SidebarThread,
  SidebarThreadsSection,
  toSidebarThread,
  writeThreadReadState,
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
  calendarNavItem,
  newThreadNavItem,
  primaryNavigation,
  profileNavItem,
  settingsNavItem,
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
  description:
    'Search app content across threads, releases, artists, tasks, and more',
};

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

type MoreNavSection = {
  readonly key: 'more';
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
  const [threadReadAtById, setThreadReadAtById] =
    useState<Record<string, string>>(readThreadReadState);
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

  useEffect(() => {
    if (!conversations || conversations.length === 0) return;

    setThreadReadAtById(previous => {
      if (Object.keys(previous).length > 0) return previous;

      const baseline = Object.fromEntries(
        conversations.map(conversation => [
          conversation.id,
          conversation.updatedAt,
        ])
      );
      writeThreadReadState(baseline);
      return baseline;
    });
  }, [conversations]);

  // Settings nav: "General" (user) and artist name (or "Artist") groups
  const artistSettingsLabel = artistName || 'Artist';
  const moreLabel = 'More';

  // Memoize nav sections for dashboard (non-settings) mode
  const { moreSection, navSections } = useMemo<{
    readonly moreSection: MoreNavSection | null;
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

    const releaseItem = primaryNavigation.find(item => item.id === 'releases');
    const audienceItem = primaryNavigation.find(item => item.id === 'audience');
    const tasksItem = primaryNavigation.find(item => item.id === 'tasks');

    if (shellChatV1Enabled) {
      return {
        moreSection: {
          key: 'more',
          label: moreLabel,
          items: [profileNavItem, settingsNavItem].map(decorateItem),
        },
        navSections: [
          {
            key: 'work',
            label: 'Work',
            items: [
              decorateItem(newThreadNavItem),
              searchNavItem,
              ...(tasksItem ? [decorateItem(tasksItem)] : []),
              decorateItem(calendarNavItem),
            ],
          },
          {
            key: 'catalog',
            label: 'Catalog',
            items: releaseItem ? [decorateItem(releaseItem)] : [],
          },
          {
            key: 'growth',
            label: 'Growth',
            items: audienceItem ? [decorateItem(audienceItem)] : [],
          },
        ],
      };
    }

    return {
      moreSection: null,
      navSections: [
        {
          key: 'primary',
          items: primaryNavigation.map(decorateItem),
        },
      ],
    };
  }, [
    canAccessTasksWorkspace,
    isPlanGateLoading,
    moreLabel,
    shellChatV1Enabled,
    taskStats,
  ]);

  // Debounced prefetch: avoid firing on fast mouse sweeps across nav items
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releasesPrefetchedProfileIdRef = useRef<string | null>(null);
  const releasesWarmReadyProfileIdRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    []
  );

  useEffect(() => {
    releasesPrefetchedProfileIdRef.current = null;
    releasesWarmReadyProfileIdRef.current = null;
  }, [profileId]);

  const warmReleasesRoute = useCallback(async () => {
    if (isDemo || !profileId) {
      return;
    }

    if (releasesPrefetchedProfileIdRef.current === profileId) {
      router.prefetch(APP_ROUTES.RELEASES);
      return;
    }

    releasesPrefetchedProfileIdRef.current = profileId;
    router.prefetch(APP_ROUTES.RELEASES);

    try {
      await Promise.all([
        import('@/features/dashboard/organisms/release-provider-matrix'),
        import('@/lib/queries/prefetch-dashboard').then(
          ({ prefetchForRoute }) =>
            prefetchForRoute('releases', queryClient, profileId)
        ),
      ]);

      releasesPrefetchedProfileIdRef.current = profileId;
      releasesWarmReadyProfileIdRef.current = profileId;
    } catch {
      releasesPrefetchedProfileIdRef.current = null;
      releasesWarmReadyProfileIdRef.current = null;
    }
  }, [isDemo, profileId, queryClient, router]);

  useEffect(() => {
    if (
      isDemo ||
      !profileId ||
      releasesWarmReadyProfileIdRef.current === profileId ||
      pathname === APP_ROUTES.RELEASES ||
      pathname === APP_ROUTES.DASHBOARD_RELEASES
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
      warmReleasesRoute().catch(() => {});
    }, 300);

    return () => clearTimeout(handle);
  }, [isDemo, pathname, profileId, warmReleasesRoute]);

  const handlePrefetch = useCallback(
    (itemId: string) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      const prefetchDelayMs = itemId === 'releases' ? 0 : 150;
      prefetchTimerRef.current = setTimeout(() => {
        if (itemId === 'releases') {
          warmReleasesRoute().catch(() => {});
          return;
        }
        import('@/lib/queries/prefetch-dashboard')
          .then(({ prefetchForRoute }) =>
            prefetchForRoute(itemId, queryClient, profileId || undefined)
          )
          .catch(() => {});
      }, prefetchDelayMs);
    },
    [profileId, queryClient, warmReleasesRoute]
  );

  const showPendingReleasesShell = useCallback(() => {
    if (releasesWarmReadyProfileIdRef.current === profileId) {
      return;
    }

    showPendingShell('releases');
  }, [profileId, showPendingShell]);

  const clearPendingReleasesShell = useCallback(() => {
    if (releasesWarmReadyProfileIdRef.current === profileId) {
      return;
    }

    clearPendingShell('releases');
  }, [clearPendingShell, profileId]);

  // In demo mode, intercept nav clicks for tabs without demo data
  const handleDemoNavClick = useCallback((item: NavItem) => {
    toast.info(`${item.name} is not available in demo mode`);
  }, []);

  const handleSearchClick = useCallback(() => {
    openCommandPalette();
  }, []);

  const activeThreadId = useMemo(() => {
    const chatPrefix = `${APP_ROUTES.CHAT}/`;
    if (!pathname.startsWith(chatPrefix)) return null;
    const [id] = pathname.slice(chatPrefix.length).split('/');
    return id ? decodeURIComponent(id) : null;
  }, [pathname]);

  useEffect(() => {
    if (!activeThreadId || !conversations) return;

    const activeConversation = conversations.find(
      conversation => conversation.id === activeThreadId
    );
    if (!activeConversation) return;

    setThreadReadAtById(previous => {
      if (previous[activeThreadId] === activeConversation.updatedAt) {
        return previous;
      }

      const next = {
        ...previous,
        [activeThreadId]: activeConversation.updatedAt,
      };
      writeThreadReadState(next);
      return next;
    });
  }, [activeThreadId, conversations]);

  const sidebarThreads = useMemo<SidebarThread[]>(
    () =>
      (conversations ?? []).map(conversation =>
        toSidebarThread(conversation, {
          activeThreadId,
          readAt: threadReadAtById[conversation.id],
        })
      ),
    [activeThreadId, conversations, threadReadAtById]
  );

  const handleRetryThreads = useCallback(() => {
    Promise.resolve(refetchConversations()).catch(() => {});
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
        isActive = isItemActive(pathname, item);
      } else if (isNewThreadItem) {
        isActive = normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT;
      } else if (!isSearchItem) {
        isActive = isItemActive(pathname, item);
      }
      const shortcut = NAV_SHORTCUTS[item.id];

      // In demo mode, only Releases has real content — intercept all other nav clicks
      const demoUnavailable = isDemo && !isReleasesItem && !isSearchItem;
      const renderAsButton = isSearchItem;
      let onClick: (() => void) | undefined;
      if (demoUnavailable) onClick = () => handleDemoNavClick(item);
      else if (isSearchItem) onClick = handleSearchClick;

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
            isReleasesItem && !isActive ? showPendingReleasesShell : undefined
          }
          onCancelNavigate={
            isReleasesItem && !isActive ? clearPendingReleasesShell : undefined
          }
          onPrefetch={() => handlePrefetch(item.id)}
        />
      );
    },
    [
      pathname,
      profileActions,
      handleDemoNavClick,
      handlePrefetch,
      handleSearchClick,
      clearPendingReleasesShell,
      showPendingReleasesShell,
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
          <SidebarCollapsibleGroup
            label='General'
            defaultOpen
            storageKey='settings.general'
          >
            {renderSection(userSettingsNavigation)}
          </SidebarCollapsibleGroup>
          <SidebarCollapsibleGroup
            label={artistSettingsLabel}
            defaultOpen={false}
            storageKey='settings.artist'
          >
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
                    storageKey={`dashboard.${section.key}`}
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
            allThreadsActive={
              normalizeTrailingSlash(pathname) === APP_ROUTES.THREADS
            }
            onNewThread={() => {
              router.push(APP_ROUTES.CHAT);
            }}
            state={
              conversationsError
                ? 'error'
                : conversationsLoading
                  ? 'loading'
                  : 'idle'
            }
            onRetry={handleRetryThreads}
            tight
            collapsed={false}
          />
        </div>
      ) : null}

      {moreSection ? (
        <div data-nav-section={moreSection.key} className='mt-3'>
          <SidebarCollapsibleGroup
            label={moreSection.label}
            defaultOpen={false}
            storageKey={moreSection.key}
          >
            {renderSection(moreSection.items)}
          </SidebarCollapsibleGroup>
        </div>
      ) : null}

      {isAdmin && !isInSettings && (
        <div data-testid='admin-nav-section' className='mt-3'>
          <SidebarCollapsibleGroup
            label='Admin'
            defaultOpen={false}
            storageKey='dashboard.admin'
          >
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
