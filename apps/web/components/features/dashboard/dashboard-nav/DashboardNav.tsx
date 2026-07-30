'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { NavBadge } from '@/components/atoms/NavBadge';
import { toast } from '@/components/feedback';
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
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { shouldShowInboxNavigation } from '@/lib/inbox/navigation-availability';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { usePlanGate } from '@/lib/queries';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { useTaskStatsQuery } from '@/lib/queries/useTasksQuery';
import {
  type NavigationTelemetryContext,
  startNavigationTelemetry,
  trackNavigationImpressions,
} from '@/lib/tracking/navigation-telemetry';
import {
  artistSettingsNavigation,
  primaryNavigation,
  userSettingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { isLibraryNavigationRoute } from './navigation-state';
import type { DashboardNavProps, NavItem } from './types';

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

function navItemPathname(href: string): string {
  return new URL(href, 'https://jovie.local').pathname;
}

function isItemActive(pathname: string, item: NavItem): boolean {
  // Inbox owns only the shell root. Prefix matching `/app` would otherwise
  // mark it active on every customer route.
  if (item.id === 'inbox') {
    return normalizeTrailingSlash(pathname) === APP_ROUTES.DASHBOARD;
  }

  if (item.id === 'library') {
    return isLibraryNavigationRoute(pathname);
  }

  const normalizedPathname = (() => {
    if (isLibraryNavigationRoute(pathname)) {
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

export function DashboardNav({ children: searchSurface }: DashboardNavProps) {
  const { inboxNavigation, selectedProfile } = useDashboardData();
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isElectron = useIsElectronRuntime();
  const [threadReadAtById, setThreadReadAtById] =
    useState<Record<string, string>>(readThreadReadState);
  const [tasksSeenAt, setTasksSeenAt] = useState<string | null>(
    readTasksSeenAt
  );
  const profileId = selectedProfile?.id ?? '';
  const isDemo = isDemoRoutePath(pathname);
  const telemetryContext = useMemo<NavigationTelemetryContext>(
    () => ({
      isElectron,
      isMobile,
      navVariant: 'canonical_customer_ia_v1',
    }),
    [isElectron, isMobile]
  );
  const { canAccessTasksWorkspace, isLoading: isPlanGateLoading } =
    usePlanGate();
  const { data: taskStats } = useTaskStatsQuery(profileId, {
    enabled: !isDemo && canAccessTasksWorkspace,
    seenAt: tasksSeenAt,
  });
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);
  const visiblePrimaryNavigation = useMemo(
    () =>
      primaryNavigation.filter(
        item =>
          item.id !== 'inbox' ||
          shouldShowInboxNavigation(
            inboxNavigation,
            isItemActive(pathname, item)
          )
      ),
    [inboxNavigation, pathname]
  );
  const threadsVisible =
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

  useEffect(() => {
    if (isDemo || isMobile) return;
    trackNavigationImpressions(
      isInSettings
        ? ['settings']
        : visiblePrimaryNavigation.map(item => item.id),
      pathname,
      telemetryContext
    );
  }, [
    isDemo,
    isInSettings,
    isMobile,
    pathname,
    telemetryContext,
    visiblePrimaryNavigation,
  ]);

  const artistSettingsLabel = 'Artist';

  // Memoize nav sections for dashboard (non-settings) mode
  const navSections = useMemo<readonly DashboardNavSection[]>(() => {
    const decorateItem = (item: NavItem): NavItem => {
      if (item.id === 'tasks') {
        const taskCount = canAccessTasksWorkspace
          ? formatTaskBadge(taskStats, tasksSeenAt)
          : undefined;

        return {
          ...item,
          badge: (() => {
            if (isPlanGateLoading) return undefined;
            if (canAccessTasksWorkspace) {
              return taskCount == null ? undefined : (
                <NavBadge
                  variant='count'
                  count={taskCount}
                  aria-label={`${taskCount} ${tasksSeenAt ? 'new ' : ''}active tasks`}
                />
              );
            }
            return <NavBadge variant='pro' />;
          })(),
        };
      }

      return item;
    };

    return [
      {
        key: 'primary',
        items: visiblePrimaryNavigation.map(decorateItem),
      },
    ];
  }, [
    canAccessTasksWorkspace,
    isPlanGateLoading,
    taskStats,
    tasksSeenAt,
    visiblePrimaryNavigation,
  ]);

  // Debounced prefetch: avoid firing on fast mouse sweeps across nav items
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const libraryPrefetchedProfileIdRef = useRef<string | null>(null);
  const libraryWarmReadyProfileIdRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    []
  );

  useEffect(() => {
    libraryPrefetchedProfileIdRef.current = null;
    libraryWarmReadyProfileIdRef.current = null;
  }, [profileId]);

  const warmLibraryRoute = useCallback(async () => {
    if (isDemo || !profileId) return;

    router.prefetch(APP_ROUTES.LIBRARY);
    if (libraryPrefetchedProfileIdRef.current === profileId) return;

    libraryPrefetchedProfileIdRef.current = profileId;
    try {
      await Promise.all([
        import('@/features/dashboard/organisms/release-provider-matrix'),
        import('@/lib/queries/prefetch-dashboard').then(
          ({ prefetchForRoute }) =>
            prefetchForRoute('library', queryClient, profileId)
        ),
      ]);
      libraryWarmReadyProfileIdRef.current = profileId;
    } catch {
      libraryPrefetchedProfileIdRef.current = null;
      libraryWarmReadyProfileIdRef.current = null;
    }
  }, [isDemo, profileId, queryClient, router]);

  useEffect(() => {
    if (
      isDemo ||
      !profileId ||
      libraryWarmReadyProfileIdRef.current === profileId ||
      isLibraryNavigationRoute(pathname)
    ) {
      return;
    }

    const handle = setTimeout(() => {
      warmLibraryRoute().catch(() => {});
    }, 300);

    return () => clearTimeout(handle);
  }, [isDemo, pathname, profileId, warmLibraryRoute]);

  const handlePrefetch = useCallback(
    (itemId: string) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      const prefetchDelayMs = itemId === 'library' ? 0 : 150;
      prefetchTimerRef.current = setTimeout(() => {
        if (itemId === 'library') {
          warmLibraryRoute().catch(() => {});
          return;
        }
        import('@/lib/queries/prefetch-dashboard')
          .then(({ prefetchForRoute }) =>
            prefetchForRoute(itemId, queryClient, profileId || undefined)
          )
          .catch(() => {});
      }, prefetchDelayMs);
    },
    [profileId, queryClient, warmLibraryRoute]
  );

  // In demo mode, intercept nav clicks for tabs without demo data
  const handleDemoNavClick = useCallback((item: NavItem) => {
    toast.info(`${item.name} is not available in demo mode`);
  }, []);

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
      const isNewThreadItem =
        item.id === 'chat' && item.href === APP_ROUTES.CHAT;
      const isActive = isNewThreadItem
        ? normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT
        : isItemActive(pathname, item);
      const shortcut = NAV_SHORTCUTS[item.id];

      // In demo mode, only Library has real content — intercept all other nav clicks.
      const demoUnavailable = isDemo && item.id !== 'library';

      return (
        <NavMenuItem
          key={item.id}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          prefetch={undefined}
          onClick={demoUnavailable ? () => handleDemoNavClick(item) : undefined}
          onActivate={
            demoUnavailable
              ? undefined
              : inputMethod =>
                  startNavigationTelemetry({
                    itemId: isInSettings ? 'settings' : item.id,
                    sourcePathname: pathname,
                    destinationHref: item.href,
                    inputMethod,
                    context: telemetryContext,
                  })
          }
          preventNavigation={demoUnavailable}
          renderAsButton={false}
          onPrefetch={() => handlePrefetch(item.id)}
        />
      );
    },
    [
      pathname,
      handleDemoNavClick,
      handlePrefetch,
      isDemo,
      isInSettings,
      telemetryContext,
    ]
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: readonly NavItem[]) => (
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
                    <>
                      {renderSection(section.items.slice(0, 1))}
                      {index === 0 && searchSurface ? (
                        <div
                          data-sidebar-search-slot='true'
                          className='my-1.5 h-7 shrink-0 group-data-[collapsible=icon]:hidden'
                        >
                          {searchSurface}
                        </div>
                      ) : null}
                      {renderSection(section.items.slice(1))}
                    </>
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
      </nav>
      {contextMenuOverlay}
    </>
  );
}
