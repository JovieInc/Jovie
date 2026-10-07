'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
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
import { useRuntimeUpdate } from '@/components/shell/RuntimeUpdateProvider';
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
import { useAppFlag } from '@/lib/flags/client';
import { NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import {
  NAVIGATION_DROP_OFF_MS,
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
  inboxNavItem,
  navigationVisibleForFlags,
  userSettingsNavigation,
} from './config';
import { NavMenuItem } from './NavMenuItem';
import { isNavigationItemActive } from './navigation-state';
import type { DashboardNavProps, NavItem } from './types';

type DashboardNavSection = {
  readonly key: string;
  readonly label?: string;
  readonly items: NavItem[];
};

function normalizeTrailingSlash(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
}

interface PendingNavigationRecord {
  readonly itemId: string;
  readonly startedAt: number;
}

// The paint-only nav acknowledgment stays visible for a minimum window so it
// is observable even when a prefetched route commits the URL almost
// immediately. A transition that fails without committing a URL recovers on
// the same drop-off window navigation telemetry uses instead of sticking.
const PENDING_NAVIGATION_MIN_VISIBLE_MS = 400;
const PENDING_NAVIGATION_RECOVERY_MS = NAVIGATION_DROP_OFF_MS;

export function DashboardNav({
  children: searchSurface,
  headerOwnsInbox = false,
}: DashboardNavProps) {
  const { selectedProfile, inboxNavigation } = useDashboardData();
  const runtimeUpdate = useRuntimeUpdate();
  const profilesWorkspaceEnabled = useAppFlag('PROFILES_WORKSPACE');
  const sidebarNavigation = useMemo(
    () =>
      navigationVisibleForFlags(canonicalSidebarNavigation, {
        PROFILES_WORKSPACE: profilesWorkspaceEnabled,
      }),
    [profilesWorkspaceEnabled]
  );
  const hasRuntimeUpdate = Boolean(runtimeUpdate?.available);
  const homeAttentionLabel = inboxNavItem.name;
  const homeAttentionName = hasRuntimeUpdate
    ? `${homeAttentionLabel} — App Update Available`
    : homeAttentionLabel;
  const { isMobile, openMobile, state: sidebarState } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentNavigationHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigationRecord | null>(null);
  const pendingNavigationTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set()
  );
  const previousNavigationHrefRef = useRef(currentNavigationHref);
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

  const schedulePendingNavigationClear = useCallback(
    (record: PendingNavigationRecord, delayMs: number) => {
      const timer = setTimeout(() => {
        pendingNavigationTimersRef.current.delete(timer);
        setPendingNavigation(current => (current === record ? null : current));
      }, delayMs);
      pendingNavigationTimersRef.current.add(timer);
    },
    []
  );

  const beginPendingNavigation = useCallback(
    (itemId: string) => {
      const record: PendingNavigationRecord = {
        itemId,
        startedAt: Date.now(),
      };
      setPendingNavigation(record);
      schedulePendingNavigationClear(record, PENDING_NAVIGATION_RECOVERY_MS);
    },
    [schedulePendingNavigationClear]
  );

  const cancelPendingNavigation = useCallback((itemId: string) => {
    setPendingNavigation(current =>
      current?.itemId === itemId ? null : current
    );
  }, []);

  // Route segments keep authenticated content mounted during a warm
  // transition, so the committed URL — not a loading surface — is what ends
  // the acknowledgment. Hold the pending state for a minimum visible window
  // once the URL commits so fast prefetched transitions still expose it.
  useEffect(() => {
    const hrefChanged =
      previousNavigationHrefRef.current !== currentNavigationHref;
    previousNavigationHrefRef.current = currentNavigationHref;
    if (!hrefChanged || !pendingNavigation) return;

    const remainingMs =
      PENDING_NAVIGATION_MIN_VISIBLE_MS -
      (Date.now() - pendingNavigation.startedAt);
    if (remainingMs <= 0) {
      setPendingNavigation(null);
    } else {
      schedulePendingNavigationClear(pendingNavigation, remainingMs);
    }
  }, [
    currentNavigationHref,
    pendingNavigation,
    schedulePendingNavigationClear,
  ]);

  useEffect(
    () => () => {
      for (const timer of pendingNavigationTimersRef.current) {
        clearTimeout(timer);
      }
      pendingNavigationTimersRef.current.clear();
    },
    []
  );

  // Connectivity loss can retain the source URL. Clear its acknowledgment
  // immediately; the existing per-navigation recovery timer remains bounded.
  useEffect(() => {
    if (!pendingNavigation) return;
    const clearAcknowledgment = () => setPendingNavigation(null);
    globalThis.addEventListener('offline', clearAcknowledgment);
    return () => globalThis.removeEventListener('offline', clearAcknowledgment);
  }, [pendingNavigation]);

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
              className='flex min-h-9 shrink-0 items-center gap-(--space-2-5)'
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
                <Link
                  href={APP_ROUTES.DASHBOARD}
                  onClick={event => handleCommandClick(event, inboxNavItem)}
                  prefetch={!isDemo}
                  aria-busy={
                    pendingNavigation?.itemId === inboxNavItem.id || undefined
                  }
                  aria-label={homeAttentionName}
                  data-inbox-attention={
                    hasRuntimeUpdate
                      ? 'available'
                      : (inboxNavigation?.state ?? 'unknown')
                  }
                  data-navigation-item-id={inboxNavItem.id}
                  data-navigation-pending={
                    pendingNavigation?.itemId === inboxNavItem.id || undefined
                  }
                  className={cn(
                    'relative flex size-7 shrink-0 items-center justify-center rounded-full text-secondary-token transition-colors duration-subtle ease-subtle hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2 after:lg:hidden',
                    pendingNavigation?.itemId === inboxNavItem.id &&
                      'bg-sidebar-accent-active text-primary-token'
                  )}
                >
                  <Bell
                    className='size-(--app-shell-sidebar-icon-size)'
                    aria-hidden='true'
                  />
                  {inboxNavigation?.state === 'available' &&
                  (inboxNavigation.pendingCount ?? 0) > 0 ? (
                    <span
                      role='status'
                      aria-label={`${inboxNavigation.pendingCount} pending items`}
                      className='absolute -right-0.5 -top-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-accent text-(length:--app-shell-sidebar-badge-font-size) font-bold text-(--color-bg-base)'
                    >
                      {Math.min(inboxNavigation.pendingCount ?? 0, 99)}
                    </span>
                  ) : hasRuntimeUpdate ? (
                    <span
                      aria-hidden='true'
                      data-inbox-runtime-update
                      className='absolute right-0 top-0 size-1.5 rounded-full bg-accent'
                    />
                  ) : null}
                </Link>
              )}
              <SidebarMenu className='min-w-0 flex-1'>
                {renderNavItem(chatNavItem, -1)}
              </SidebarMenu>
            </div>
            <SidebarGroupContent className='pb-2 pt-5'>
              {navSections.map(section => (
                <div key={section.key} data-nav-section={section.key}>
                  {renderSection(section.items)}
                </div>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {threadsVisible ? (
          <div className='pt-5'>
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
