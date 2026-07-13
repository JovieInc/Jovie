'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { toast } from '@/components/feedback';
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
import { useChatThreadContextMenu } from '@/components/shell/useChatThreadContextMenu';
import {
  APP_ROUTES,
  buildLibraryViewRoute,
  isDemoRoutePath,
} from '@/constants/routes';
import { useAppFlag } from '@/lib/flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { usePlanGate } from '@/lib/queries';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { useTaskStatsQuery } from '@/lib/queries/useTasksQuery';
import {
  adminNavigationSections,
  artistSettingsNavigation,
  primaryNavigation,
  userSettingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import type { DashboardNavProps, NavItem } from './types';

const searchNavItem: NavItem = {
  name: 'Search',
  href: APP_ROUTES.CHAT,
  id: 'search',
  icon: Search,
  description:
    'Search app content across conversations, releases, artists, tasks, and more',
};

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

function navItemPathname(href: string): string {
  return new URL(href, 'https://jovie.local').pathname;
}

function isReleasesRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.LIBRARY ||
    pathname === APP_ROUTES.DASHBOARD_LIBRARY ||
    pathname === APP_ROUTES.LEGACY_DASHBOARD_LIBRARY ||
    pathname === APP_ROUTES.RELEASES ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES
  );
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.id === 'inbox') {
    // Inbox is the named home at exactly `/app` — it must not stay active
    // on every `/app/*` subroute the generic prefix-match below would
    // otherwise catch (GH #12634).
    return normalizeTrailingSlash(pathname) === APP_ROUTES.DASHBOARD;
  }

  if (item.id === 'releases') {
    return isReleasesRoute(pathname);
  }

  if (item.id === 'artist-profile') {
    return (
      pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE ||
      pathname.startsWith(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}/`)
    );
  }

  if (item.id === 'touring') {
    return (
      pathname === APP_ROUTES.SETTINGS_TOURING ||
      pathname.startsWith(`${APP_ROUTES.SETTINGS_TOURING}/`)
    );
  }

  const normalizedPathname = (() => {
    if (isReleasesRoute(pathname)) {
      return APP_ROUTES.LIBRARY;
    }
    if (
      pathname === APP_ROUTES.DASHBOARD_AUDIENCE ||
      pathname === APP_ROUTES.AUDIENCE
    ) {
      return APP_ROUTES.AUDIENCE;
    }
    return pathname;
  })();

  const itemPathname = navItemPathname(item.href);

  if (normalizedPathname === itemPathname || normalizedPathname === item.href) {
    return true;
  }

  // Admin routes need exact match to avoid false positives
  if (item.href === APP_ROUTES.ADMIN) {
    return false;
  }

  return normalizedPathname.startsWith(`${itemPathname}/`);
}

function normalizeTrailingSlash(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
}

const TASKS_SEEN_STORAGE_KEY = 'jovie:tasks-seen-at';

function readTasksSeenAt(): string | null {
  try {
    return globalThis.localStorage?.getItem(TASKS_SEEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeTasksSeenAt(value: string): void {
  try {
    globalThis.localStorage?.setItem(TASKS_SEEN_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in restricted browsers; the badge still works.
  }
}

function formatTaskBadge(
  taskStats:
    | { activeTodoCount: number; newActiveTodoCount?: number }
    | undefined,
  seenAt: string | null
): string | number | undefined {
  if (!taskStats || taskStats.activeTodoCount <= 0) return undefined;
  const count = seenAt
    ? (taskStats.newActiveTodoCount ?? 0)
    : taskStats.activeTodoCount;
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : count;
}

export function DashboardNav(_: DashboardNavProps) {
  const { isAdmin, selectedProfile } = useDashboardData();
  const { clearPendingShell, showPendingShell } = usePendingShell();
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen: isPreviewPanelOpen, open: openPreviewPanel } =
    usePreviewPanelState();
  const queryClient = useQueryClient();
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const inboxHomeEnabled = useAppFlag('INBOX_HOME');
  const [threadReadAtById, setThreadReadAtById] =
    useState<Record<string, string>>(readThreadReadState);
  const [tasksSeenAt, setTasksSeenAt] = useState<string | null>(
    readTasksSeenAt
  );
  const artistName = selectedProfile?.displayName?.trim();
  const profileId = selectedProfile?.id ?? '';
  const isDemo = isDemoRoutePath(pathname);
  const { canAccessTasksWorkspace, isLoading: isPlanGateLoading } =
    usePlanGate();
  const { data: taskStats } = useTaskStatsQuery(profileId, {
    enabled: !isDemo && canAccessTasksWorkspace,
    seenAt: tasksSeenAt,
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

  useEffect(() => {
    if (normalizeTrailingSlash(pathname) !== APP_ROUTES.TASKS) return;
    const nextSeenAt = new Date().toISOString();
    writeTasksSeenAt(nextSeenAt);
    setTasksSeenAt(nextSeenAt);
  }, [pathname]);

  // Settings nav: "General" (user) and artist name (or "Artist") groups.
  // In the chat shell the artist row itself shows the display name, so keep the
  // section label generic to avoid duplicate "Tim White" buttons in the sidebar.
  const artistSettingsLabel =
    shellChatV1Enabled || isInSettings ? 'Artist' : artistName || 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode.
  //
  // Canonical 6-item nav IA (GH #12634 taste decision / #12640): Inbox,
  // Chat, Library, Contacts, Calendar, Tasks. `primaryNavigation` in
  // config.ts is the single source of truth for order/labels/routes; Inbox
  // is filtered out here (rather than in config.ts) while the `INBOX_HOME`
  // rollout flag is off, so nav and the /app page title/copy
  // (OpportunityInboxPageClient) never drift out of sync mid-rollout.
  // Search is a command-palette trigger, not a nav destination, so it isn't
  // part of the canonical 6 — it renders alongside them, immediately after
  // Chat, matching its previous position.
  const navSections = useMemo<readonly DashboardNavSection[]>(() => {
    const decorateItem = (item: NavItem): NavItem => {
      if (item.id === 'tasks') {
        return {
          ...item,
          badge: (() => {
            if (isPlanGateLoading) return undefined;
            if (canAccessTasksWorkspace)
              return formatTaskBadge(taskStats, tasksSeenAt);
            return (
              <span className='rounded-full border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_90%,transparent)] px-1.5 py-0.5 text-3xs font-semibold tracking-wider text-secondary-token'>
                Pro
              </span>
            );
          })(),
        };
      }

      return item;
    };

    const canonicalItems = (
      inboxHomeEnabled
        ? primaryNavigation
        : primaryNavigation.filter(item => item.id !== 'inbox')
    ).map(decorateItem);

    const chatIndex = canonicalItems.findIndex(item => item.id === 'chat');
    const items =
      chatIndex === -1
        ? [...canonicalItems, searchNavItem]
        : [
            ...canonicalItems.slice(0, chatIndex + 1),
            searchNavItem,
            ...canonicalItems.slice(chatIndex + 1),
          ];

    return [{ key: 'primary', items }];
  }, [
    canAccessTasksWorkspace,
    isPlanGateLoading,
    inboxHomeEnabled,
    taskStats,
    tasksSeenAt,
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

    const releasesRoute = buildLibraryViewRoute('releases');

    if (releasesPrefetchedProfileIdRef.current === profileId) {
      router.prefetch(releasesRoute);
      return;
    }

    releasesPrefetchedProfileIdRef.current = profileId;
    router.prefetch(releasesRoute);

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
      pathname === APP_ROUTES.DASHBOARD_RELEASES ||
      pathname === APP_ROUTES.LIBRARY
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

  const handleOpenArtistProfilePanel = useCallback(() => {
    const isOnChat = pathname.startsWith(APP_ROUTES.CHAT);

    if (isOnChat) {
      openPreviewPanel();
      return;
    }

    router.push(APP_ROUTES.CHAT);
    queueMicrotask(() => {
      openPreviewPanel();
    });
  }, [openPreviewPanel, pathname, router]);

  const activeThreadId = useMemo(() => {
    const chatPrefix = `${APP_ROUTES.CHAT}/`;
    if (!pathname.startsWith(chatPrefix)) return null;
    const [id] = pathname.slice(chatPrefix.length).split('/');
    return id ? decodeURIComponent(id) : null;
  }, [pathname]);

  const { onThreadContextMenu, contextMenuOverlay } = useChatThreadContextMenu({
    activeThreadId,
  });

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
      const isReleasesItem = item.id === 'releases';
      const isSearchItem = item.id === 'search';
      const opensArtistProfilePanel =
        shellChatV1Enabled && !isInSettings && item.id === 'artist-profile';
      const isNewThreadItem =
        item.id === 'chat' && item.href === APP_ROUTES.CHAT;
      let isActive = false;
      if (isNewThreadItem) {
        isActive = normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT;
      } else if (opensArtistProfilePanel) {
        isActive = isPreviewPanelOpen;
      } else if (!isSearchItem) {
        isActive = isItemActive(pathname, item);
      }
      const shortcut = NAV_SHORTCUTS[item.id];

      // In demo mode, only Releases has real content — intercept all other nav clicks
      const demoUnavailable = isDemo && !isReleasesItem && !isSearchItem;
      const renderAsButton = isSearchItem || opensArtistProfilePanel;
      let onClick: (() => void) | undefined;
      if (demoUnavailable) onClick = () => handleDemoNavClick(item);
      else if (isSearchItem) onClick = handleSearchClick;
      else if (opensArtistProfilePanel) onClick = handleOpenArtistProfilePanel;

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          prefetch={undefined}
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
      handleDemoNavClick,
      handlePrefetch,
      handleSearchClick,
      handleOpenArtistProfilePanel,
      clearPendingReleasesShell,
      showPendingReleasesShell,
      isDemo,
      isInSettings,
      isPreviewPanelOpen,
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
    <>
      <nav className='flex flex-1 flex-col' aria-label='Dashboard Navigation'>
        {isInSettings ? (
          <>
            <SidebarCollapsibleGroup
              label='Account'
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
                normalizeTrailingSlash(pathname) === APP_ROUTES.CHATS
              }
              onThreadContextMenu={onThreadContextMenu}
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
                  <p className='px-2.5 pb-0.5 text-xs font-caption tracking-normal text-sidebar-muted/90 group-data-[collapsible=icon]:hidden'>
                    {section.label}
                  </p>
                  {renderSection(section.items)}
                </div>
              ))}
            </SidebarCollapsibleGroup>
          </div>
        )}
      </nav>
      {contextMenuOverlay}
    </>
  );
}
