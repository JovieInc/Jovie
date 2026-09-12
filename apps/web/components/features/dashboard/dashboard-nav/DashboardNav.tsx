'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Bell, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
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
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import {
  type NavigationTelemetryContext,
  navigationInputMethodFromClick,
  startNavigationTelemetry,
  trackNavigationImpressions,
} from '@/lib/tracking/navigation-telemetry';
import {
  artistSettingsNavigation,
  canonicalSidebarNavigation,
  chatNavItem,
  inboxNavItem,
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
      return APP_ROUTES.CONTACTS;
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

export function DashboardNav({ children: searchSurface }: DashboardNavProps) {
  const { selectedProfile, inboxNavigation } = useDashboardData();
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isElectron = useIsElectronRuntime();
  // Persisted navigation state is a client-only enhancement. Reading it during
  // the first render would make a returning browser render different badges
  // from the server markup and can force React to abandon hydration.
  const [threadReadAtById, setThreadReadAtById] = useState<
    Record<string, string>
  >({});
  const [hasHydratedPersistedState, setHasHydratedPersistedState] =
    useState(false);
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
  const isInSettings = pathname.startsWith(APP_ROUTES.SETTINGS);
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
    setThreadReadAtById(readThreadReadState());
    setHasHydratedPersistedState(true);
  }, []);

  useEffect(() => {
    if (
      !hasHydratedPersistedState ||
      !conversations ||
      conversations.length === 0
    ) {
      return;
    }

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
  }, [conversations, hasHydratedPersistedState]);

  useEffect(() => {
    if (isDemo || isMobile) return;
    trackNavigationImpressions(
      isInSettings
        ? ['settings']
        : ['inbox', 'chat', ...canonicalSidebarNavigation.map(item => item.id)],
      pathname,
      telemetryContext
    );
  }, [isDemo, isInSettings, isMobile, pathname, telemetryContext]);

  const artistSettingsLabel = 'Artist';

  const navSections: readonly DashboardNavSection[] = [
    { key: 'primary', items: [...canonicalSidebarNavigation] },
  ];

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

  const handleCommandClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    item: NavItem
  ) => {
    if (isDemo) {
      event.preventDefault();
      handleDemoNavClick(item);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    startNavigationTelemetry({
      itemId: item.id,
      sourcePathname: pathname,
      destinationHref: item.href,
      inputMethod: navigationInputMethodFromClick(event.detail),
      context: telemetryContext,
    });
  };

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
          calm={!isInSettings}
          item={item}
          isActive={isActive}
          shortcut={shortcut}
          // Warm the approved customer destinations without a route flash.
          // Next's automatic mode skips full payloads for dynamic routes;
          // forcing `true` warms the complete route while preserving the
          // current-page warm-navigation contract (no loading.tsx flash).
          prefetch={!isDemo && !isInSettings ? true : undefined}
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
      <SidebarMenu className='gap-1'>
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
          <SidebarGroup className='p-0'>
            <div
              data-sidebar-search-slot='true'
              className='mx-1 flex h-9 shrink-0 items-center gap-2.5 rounded-full border border-subtle bg-surface-1 pr-1.5 group-data-[collapsible=icon]:hidden'
            >
              {searchSurface}
              <span aria-hidden='true' className='h-4 w-px bg-subtle' />
              <Link
                href={APP_ROUTES.DASHBOARD}
                onClick={event => handleCommandClick(event, inboxNavItem)}
                prefetch={!isDemo}
                aria-label='Inbox'
                aria-current={
                  normalizeTrailingSlash(pathname) === APP_ROUTES.DASHBOARD
                    ? 'page'
                    : undefined
                }
                className='relative flex size-7 shrink-0 items-center justify-center rounded-full text-secondary-token hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2 after:lg:hidden'
              >
                <Bell className='size-[15px]' aria-hidden='true' />
                {inboxNavigation?.state === 'available' &&
                (inboxNavigation.pendingCount ?? 0) > 0 ? (
                  <span
                    role='status'
                    aria-label={`${inboxNavigation.pendingCount} pending items`}
                    className='absolute -right-0.5 -top-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-background'
                  >
                    {Math.min(inboxNavigation.pendingCount ?? 0, 99)}
                  </span>
                ) : null}
              </Link>
              <Link
                href={APP_ROUTES.CHAT}
                onClick={event => handleCommandClick(event, chatNavItem)}
                aria-current={
                  normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT
                    ? 'page'
                    : undefined
                }
                prefetch={!isDemo}
                aria-label='New Chat'
                className='relative flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-(--color-bg-base) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2.5 after:lg:hidden'
              >
                <Plus className='size-3.5' aria-hidden='true' />
              </Link>
            </div>
            <SidebarGroupContent className='pb-2 pt-4'>
              {navSections.map(section => (
                <div key={section.key} data-nav-section={section.key}>
                  {renderSection(section.items)}
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {threadsVisible ? (
          <div className='pt-4'>
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
              calm
              collapsed={false}
            />
          </div>
        ) : null}
      </nav>
      {contextMenuOverlay}
    </>
  );
}
