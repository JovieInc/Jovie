'use client';

import { TooltipProvider } from '@jovie/ui';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { PreviewPanelProvider } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import {
  type TableMeta,
  TableMetaContext,
  TableMetaProvider,
  useTableMeta,
} from '@/contexts/TableMetaContext';
import { HeaderChatUsageIndicator } from '@/features/dashboard/atoms/HeaderChatUsageIndicator';
import { HeaderProfileProgress } from '@/features/dashboard/atoms/HeaderProfileProgress';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';
import { useDashboardShortcuts } from '@/hooks/useDashboardShortcuts';
import { useAppFlag } from '@/lib/flags/client';
import { AuthShell } from './AuthShell';
import { CommandPalette } from './CommandPalette';
import { OPEN_COMMAND_PALETTE_EVENT } from './command-palette-events';
import { KeyboardShortcutsSheet } from './keyboard-shortcuts-sheet';
import {
  PendingShellContext,
  type PendingShellRoute,
  usePendingShell,
} from './PendingShellContext';

export { TableMetaProvider, usePendingShell, useTableMeta };

export interface AuthShellWrapperProps {
  readonly persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  readonly sidebarDefaultOpen?: boolean;
  readonly previewPanelDefaultOpen?: boolean;
  readonly children: ReactNode;
}

/**
 * KeyboardShortcutsHandler - Handles keyboard shortcuts with access to context
 */
function KeyboardShortcutsHandler() {
  const { open } = useKeyboardShortcuts();
  useDashboardShortcuts({ onOpenShortcutsModal: open });
  return <KeyboardShortcutsSheet />;
}

function HeaderCommandSearchButton() {
  const openCommandPalette = useCallback(() => {
    globalThis.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
  }, []);

  return (
    <button
      type='button'
      data-app-search-trigger='true'
      onClick={openCommandPalette}
      className='inline-flex h-7 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2 text-[12px] text-secondary-token transition-[background-color,border-color,color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
      aria-label='Search Jovie'
    >
      <Search className='h-3.5 w-3.5' aria-hidden='true' />
      <span className='hidden sm:inline'>Search</span>
      <span className='hidden text-tertiary-token lg:inline'>/</span>
    </button>
  );
}

/**
 * AuthShellWrapperInner - Inner component with access to HeaderActionsContext
 */
function AuthShellWrapperInner({
  persistSidebarCollapsed,
  sidebarDefaultOpen,
  previewPanelDefaultOpen,
  children,
}: Readonly<{
  persistSidebarCollapsed?: AuthShellWrapperProps['persistSidebarCollapsed'];
  sidebarDefaultOpen?: boolean;
  previewPanelDefaultOpen?: boolean;
  children: ReactNode;
}>) {
  const config = useAuthRouteConfig();
  const headerActionsContext = useOptionalHeaderActions();
  const designV1Enabled = useAppFlag('DESIGN_V1');
  const [, startTransition] = useTransition();
  const [pendingShellRoute, setPendingShellRoute] =
    useState<PendingShellRoute>(null);
  const pendingShellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const releasesShellOverlayRef = useRef<HTMLDivElement | null>(null);

  // TableMeta state for audience/creators tables
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });

  // Preview panel data hydration is available on dashboard routes and artist-profile settings
  const previewEnabled =
    config.section === 'dashboard' || config.isArtistProfileSettings;
  const shouldDefaultOpenPreviewPanel =
    config.section === 'dashboard' && previewPanelDefaultOpen;

  // Determine header action: use custom actions from context if available,
  // otherwise fall back to default based on route type
  const defaultHeaderAction = useMemo(
    () => (
      <>
        {designV1Enabled ? <HeaderCommandSearchButton /> : null}
        {config.showChatUsageIndicator && !config.isDemoRoute ? (
          <HeaderChatUsageIndicator />
        ) : null}
        <HeaderProfileProgress />
      </>
    ),
    [config.isDemoRoute, config.showChatUsageIndicator, designV1Enabled]
  );
  // Wrap page-injected header elements in ErrorBoundary so a throwing badge/action
  // degrades gracefully (renders nothing + toast) instead of crashing the shell.
  const rawHeaderAction =
    headerActionsContext?.headerActions ?? defaultHeaderAction;
  const headerAction = rawHeaderAction ? (
    <ErrorBoundary fallback={null}>{rawHeaderAction}</ErrorBoundary>
  ) : null;

  // Header badge from context (shown after breadcrumb on left side)
  const rawHeaderBadge = headerActionsContext?.headerBadge ?? null;
  const headerBadge = rawHeaderBadge ? (
    <ErrorBoundary fallback={null}>{rawHeaderBadge}</ErrorBoundary>
  ) : null;

  // Memoize the sidebar open change handler to prevent context value changes
  // that would cause infinite re-render loops in sidebar consumers.
  // Only create a callback when persistSidebarCollapsed is defined, otherwise
  // useSidebarCookieState needs undefined to manage internal state.
  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      startTransition(() => {
        // Fire-and-forget: persist sidebar preference in background
        persistSidebarCollapsed?.(!open)?.catch?.(() => {});
      });
    },
    [persistSidebarCollapsed, startTransition]
  );

  const setReleasesShellVisible = useCallback((visible: boolean) => {
    const node = releasesShellOverlayRef.current;
    if (!node) {
      return;
    }

    node.style.display = visible ? 'flex' : 'none';
    node.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }, []);

  const clearPendingShell = useCallback(
    (route?: PendingShellRoute) => {
      setPendingShellRoute(current =>
        route && current !== route ? current : null
      );
      setReleasesShellVisible(false);
      if (pendingShellTimerRef.current) {
        clearTimeout(pendingShellTimerRef.current);
        pendingShellTimerRef.current = null;
      }
    },
    [setReleasesShellVisible]
  );

  const showPendingShell = useCallback(
    (route: Exclude<PendingShellRoute, null>) => {
      setPendingShellRoute(route);
      if (route === 'releases') {
        setReleasesShellVisible(true);
      }
      if (pendingShellTimerRef.current) {
        clearTimeout(pendingShellTimerRef.current);
      }

      pendingShellTimerRef.current = setTimeout(() => {
        setReleasesShellVisible(false);
        setPendingShellRoute(activeRoute =>
          activeRoute === route ? null : activeRoute
        );
        pendingShellTimerRef.current = null;
      }, 10_000);
    },
    [setReleasesShellVisible]
  );

  useEffect(
    () => () => {
      if (pendingShellTimerRef.current) {
        clearTimeout(pendingShellTimerRef.current);
      }
    },
    []
  );

  // Memoize context value to prevent unnecessary re-renders
  // setTableMeta is a stable useState setter, so we exclude it from deps
  const tableMetaContextValue = useMemo(
    () => ({ tableMeta, setTableMeta }),

    [tableMeta]
  );
  const pendingShellContextValue = useMemo(
    () => ({
      clearPendingShell,
      pendingShellRoute,
      showPendingShell,
    }),
    [clearPendingShell, pendingShellRoute, showPendingShell]
  );
  const shellChildren = (
    <div className='relative min-h-full'>
      {children}
      <div
        ref={releasesShellOverlayRef}
        aria-hidden='true'
        className='absolute inset-0 z-10 hidden items-start justify-center bg-page/96 px-4 py-6 sm:px-6'
        data-testid='releases-shell-ready'
      >
        <div className='w-full max-w-3xl rounded-2xl border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)] sm:px-5'>
          <div className='flex items-center justify-between gap-4'>
            <div>
              <p className='text-sm font-semibold tracking-[-0.02em] text-primary-token'>
                Opening Releases
              </p>
              <p className='mt-1 text-sm text-secondary-token'>
                Preparing your release workspace.
              </p>
            </div>
            <div
              aria-hidden='true'
              className='h-2.5 w-24 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_78%,transparent)]'
            >
              <div className='h-full w-1/2 animate-pulse rounded-full bg-primary-token/65' />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <TableMetaContext.Provider value={tableMetaContextValue}>
      <PendingShellContext.Provider value={pendingShellContextValue}>
        <RightPanelProvider>
          <PreviewPanelProvider
            key={config.section}
            defaultOpen={shouldDefaultOpenPreviewPanel}
            enabled={previewEnabled}
          >
            <AuthShell
              section={config.section}
              breadcrumbs={config.breadcrumbs}
              headerBadge={headerBadge}
              headerAction={headerAction}
              showMobileTabs={config.showMobileTabs}
              isTableRoute={config.isTableRoute}
              onSidebarOpenChange={
                persistSidebarCollapsed ? handleSidebarOpenChange : undefined
              }
              sidebarDefaultOpen={sidebarDefaultOpen}
            >
              {shellChildren}
            </AuthShell>
          </PreviewPanelProvider>
        </RightPanelProvider>
      </PendingShellContext.Provider>
    </TableMetaContext.Provider>
  );
}

/**
 * AuthShellWrapper - Client wrapper using routing hook to render AuthShell
 *
 * This component:
 * 1. Uses useAuthRouteConfig hook to get all routing-based configuration
 * 2. Provides HeaderActionsProvider, PreviewPanelProvider, KeyboardShortcutsProvider, and TableMetaContext
 * 3. Renders AuthShell with configuration from the hook
 * 4. Allows pages to override header actions via HeaderActionsContext
 * 5. Handles keyboard navigation shortcuts (G then X pattern)
 *
 * Separates routing concerns (hook) from layout (AuthShell).
 */
export function AuthShellWrapper({
  persistSidebarCollapsed,
  sidebarDefaultOpen,
  previewPanelDefaultOpen,
  children,
}: Readonly<AuthShellWrapperProps>) {
  return (
    <TooltipProvider delayDuration={1200}>
      <KeyboardShortcutsProvider>
        <HeaderActionsProvider>
          <AuthShellWrapperInner
            persistSidebarCollapsed={persistSidebarCollapsed}
            sidebarDefaultOpen={sidebarDefaultOpen}
            previewPanelDefaultOpen={previewPanelDefaultOpen}
          >
            {children}
          </AuthShellWrapperInner>
          <KeyboardShortcutsHandler />
          <CommandPalette />
        </HeaderActionsProvider>
      </KeyboardShortcutsProvider>
    </TooltipProvider>
  );
}
