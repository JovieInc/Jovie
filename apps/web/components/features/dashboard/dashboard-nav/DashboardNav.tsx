'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { toast } from '@/components/feedback';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/organisms/sidebar';
import { RailStagedContent } from '@/components/shell/RailStagedContent';
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
import { cn } from '@/lib/utils';
import {
  artistSettingsNavigation,
  canonicalSidebarNavigation,
  chatNavItem,
  homeNavItem,
  userSettingsNavigation,
} from './config';
import { InboxAttentionLink } from './InboxAttentionLink';
import { NavMenuItem } from './NavMenuItem';
import {
  getRailNavigation,
  isNavigationItemActive,
  isNavigationItemHighlighted,
} from './navigation-state';
import type { DashboardNavProps, NavItem } from './types';
import { usePendingNavigation } from './use-pending-navigation';

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

function normalizeTrailingSlash(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
}

const NEW_CHAT_ROW_ITEM: NavItem = {
  ...chatNavItem,
  icon: Plus,
  iconName: 'Plus',
  tone: undefined,
};

export function DashboardNav({
  children: searchSurface,
  headerOwnsInbox = false,
}: DashboardNavProps) {
  const { selectedProfile, inboxNavigation } = useDashboardData();
  const sidebarNavigation = useMemo(
    () => getRailNavigation(canonicalSidebarNavigation, headerOwnsInbox),
    [headerOwnsInbox]
  );
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentNavigationHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const { pendingNavigation, beginPendingNavigation, cancelPendingNavigation } =
    usePendingNavigation(currentNavigationHref);
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
      navVariant: 'canonical_identity_work_v1',
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
        : ['inbox', 'chat', ...sidebarNavigation.map(item => item.id)],
      pathname,
      telemetryContext
    );
  }, [
    isDemo,
    isInSettings,
    isMobile,
    pathname,
    sidebarNavigation,
    telemetryContext,
  ]);

  const artistSettingsLabel = 'Artist';

  const navSections: readonly DashboardNavSection[] = [
    { key: 'primary', items: [...sidebarNavigation] },
  ];

  // Debounced prefetch: avoid firing on fast mouse sweeps across nav items
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    },
    []
  );

  const handlePrefetch = useCallback(
    (itemId: string) => {
      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = setTimeout(() => {
        import('@/lib/queries/prefetch-dashboard')
          .then(({ prefetchForRoute }) =>
            prefetchForRoute(itemId, queryClient, profileId || undefined)
          )
          .catch(() => {});
      }, 150);
    },
    [profileId, queryClient]
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
    if (event.button === 0 && currentNavigationHref !== item.href) {
      beginPendingNavigation(item.id);
    }
    startNavigationTelemetry({
      itemId: item.id,
      sourcePathname: currentNavigationHref,
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
        ? normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT &&
          searchParams.get('panel') !== 'profile'
        : isNavigationItemActive(item, pathname, searchParams);
      const shortcut = NAV_SHORTCUTS[item.id];

      // The demo fixture only implements Work content; other roots stay disabled.
      const demoUnavailable = isDemo && item.id !== 'library';

      return (
        <NavMenuItem
          key={item.id}
          calm={!isInSettings}
          item={item}
          isActive={isActive}
          pending={pendingNavigation?.itemId === item.id}
          highlighted={isNavigationItemHighlighted(
            item.id,
            isActive,
            pendingNavigation?.itemId
          )}
          onNavigate={
            demoUnavailable || isActive
              ? undefined
              : () => beginPendingNavigation(item.id)
          }
          onCancelNavigate={
            demoUnavailable || isActive
              ? undefined
              : () => cancelPendingNavigation(item.id)
          }
          shortcut={shortcut}
          // Full prefetch (`true`) downloads every dynamic destination's RSC
          // payload on mount and blows the shell persistence request budget.
          // Click-time navigation still loads the route.
          prefetch={false}
          onClick={demoUnavailable ? () => handleDemoNavClick(item) : undefined}
          onActivate={
            demoUnavailable
              ? undefined
              : inputMethod =>
                  startNavigationTelemetry({
                    itemId: isInSettings ? 'settings' : item.id,
                    sourcePathname: currentNavigationHref,
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
      beginPendingNavigation,
      cancelPendingNavigation,
      currentNavigationHref,
      pathname,
      pendingNavigation,
      handleDemoNavClick,
      handlePrefetch,
      isDemo,
      isInSettings,
      searchParams,
      telemetryContext,
    ]
  );

  const newChatAction = (
    <Link
      href={APP_ROUTES.CHAT}
      onClick={event => handleCommandClick(event, chatNavItem)}
      aria-busy={pendingNavigation?.itemId === chatNavItem.id || undefined}
      aria-current={
        normalizeTrailingSlash(pathname) === APP_ROUTES.CHAT &&
        searchParams.get('panel') !== 'profile'
          ? 'page'
          : undefined
      }
      prefetch={false}
      aria-label='New Chat'
      data-navigation-item-id={chatNavItem.id}
      data-navigation-pending={
        pendingNavigation?.itemId === chatNavItem.id || undefined
      }
      className={cn(
        'relative flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition duration-subtle ease-subtle hover:bg-sidebar-accent hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring after:absolute after:-inset-2.5 after:lg:hidden',
        pendingNavigation?.itemId === chatNavItem.id && 'opacity-70'
      )}
    >
      <Plus className='size-3.5' aria-hidden='true' />
    </Link>
  );

  // Header owns bell and search: New Chat takes a labelled row (shell-ia.md).
  const newChatOwnsRow = headerOwnsInbox && !searchSurface;

  const commandSlot = (
    <div
      data-sidebar-search-slot='true'
      className={cn(
        'flex h-9 shrink-0 items-center gap-(--space-2-5) pr-1.5 lg:overflow-hidden',
        // The command slot keeps its vertical allocation while the
        // surrounding rail narrows; navigation below never moves.
        'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:pr-0'
      )}
    >
      <RailStagedContent
        hidden={sidebarState === 'closed' && !isMobile}
        className={cn(
          'flex min-w-0 items-center gap-(--space-2-5)',
          searchSurface && 'flex-1'
        )}
      >
        {searchSurface}
        {searchSurface ? (
          <span
            aria-hidden='true'
            data-sidebar-search-divider
            className='h-4 w-px bg-subtle'
          />
        ) : null}
        {headerOwnsInbox ? null : (
          <InboxAttentionLink
            // App updates surface in the shell's update pill, not on the
            // Home bell: Home shows no update, so the bell names only
            // pending work.
            label={homeNavItem.name}
            itemId={homeNavItem.id}
            attention={inboxNavigation?.state ?? 'unknown'}
            pendingCount={
              inboxNavigation?.state === 'available'
                ? (inboxNavigation.pendingCount ?? 0)
                : 0
            }
            navigationPending={pendingNavigation?.itemId === homeNavItem.id}
            onClick={event => handleCommandClick(event, homeNavItem)}
          />
        )}
      </RailStagedContent>
      {newChatAction}
    </div>
  );

  // Memoize renderSection to prevent creating new functions on every render
  const renderSection = useCallback(
    (items: readonly NavItem[]) => (
      <SidebarMenu className='gap-1 lg:gap-px'>
        {items.map((item, index) => renderNavItem(item, index))}
      </SidebarMenu>
    ),
    [renderNavItem]
  );

  return (
    <>
      <nav
        className='flex min-h-0 flex-1 flex-col overflow-anchor-none overflow-clip'
        aria-label='Dashboard Navigation'
      >
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
          <SidebarGroup className='p-0 lg:pt-1'>
            {newChatOwnsRow ? (
              // Keep creation on the shared navigation row and icon column.
              <div data-nav-section='create' className='[&_a]:after:-inset-y-2'>
                {renderSection([NEW_CHAT_ROW_ITEM])}
              </div>
            ) : (
              commandSlot
            )}
            <SidebarGroupContent className='pb-2 pt-5 lg:pt-px'>
              {navSections.map(section => (
                <div key={section.key} data-nav-section={section.key}>
                  {renderSection(section.items)}
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {threadsVisible ? (
          <SidebarCollapsibleGroup
            label='Chat History'
            className='pt-5'
            defaultOpen={false}
            dismissOnEscape
            unmountWhenClosed
          >
            {!conversationsLoading &&
            !conversationsError &&
            conversations?.length === 0 ? (
              <p className='px-(--app-shell-sidebar-inset) text-xs text-tertiary-token'>
                No chats yet
              </p>
            ) : (
              <SidebarThreadsSection
                threads={sidebarThreads}
                activeThreadId={activeThreadId}
                allThreadsActive={
                  normalizeTrailingSlash(pathname) === APP_ROUTES.CHATS
                }
                onThreadContextMenu={onThreadContextMenu}
                newThreadAction={false}
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
            )}
          </SidebarCollapsibleGroup>
        ) : null}
      </nav>
      {contextMenuOverlay}
    </>
  );
}
