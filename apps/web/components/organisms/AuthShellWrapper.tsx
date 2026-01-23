'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { PreviewPanelProvider } from '@/app/app/dashboard/PreviewPanelContext';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { PreviewToggleButton } from '@/components/dashboard/layout/PreviewToggleButton';
import { ProfileContactSidebar } from '@/components/dashboard/organisms/profile-contact-sidebar';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@/contexts/KeyboardShortcutsContext';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';
import { useSequentialShortcuts } from '@/hooks/useSequentialShortcuts';
import { AuthShell } from './AuthShell';
import { KeyboardShortcutsSheet } from './keyboard-shortcuts-sheet';

// TableMetaContext for audience/creators tables
type TableMeta = {
  rowCount: number | null;
  toggle?: (() => void) | null;
  rightPanelWidth?: number | null;
};

type TableMetaContextValue = {
  tableMeta: TableMeta;
  setTableMeta: (meta: TableMeta) => void;
};

const TableMetaContext = createContext<TableMetaContextValue | null>(null);

export function useTableMeta(): TableMetaContextValue {
  const ctx = useContext(TableMetaContext);
  if (!ctx) {
    throw new Error('useTableMeta must be used within AuthShellWrapper');
  }
  return ctx;
}

export interface AuthShellWrapperProps {
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: ReactNode;
}

/**
 * KeyboardShortcutsHandler - Handles keyboard shortcuts with access to context
 */
function KeyboardShortcutsHandler() {
  const { open } = useKeyboardShortcuts();
  useSequentialShortcuts({ onOpenShortcutsModal: open });
  return <KeyboardShortcutsSheet />;
}

/**
 * AuthShellWrapperInner - Inner component with access to HeaderActionsContext
 */
function AuthShellWrapperInner({
  persistSidebarCollapsed,
  children,
}: Readonly<{
  persistSidebarCollapsed?: AuthShellWrapperProps['persistSidebarCollapsed'];
  children: ReactNode;
}>) {
  const config = useAuthRouteConfig();
  const pathname = usePathname();
  const headerActionsContext = useOptionalHeaderActions();
  const [, startTransition] = useTransition();

  // TableMeta state for audience/creators tables
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });

  // Determine if preview panel should be enabled (profile route only)
  const isProfileRoute =
    pathname?.startsWith('/app/dashboard/profile') ?? false;
  const previewEnabled = config.section === 'dashboard' && isProfileRoute;

  // Determine header action: use custom actions from context if available,
  // otherwise fall back to default based on route type
  let defaultHeaderAction: ReactNode = null;
  if (config.isTableRoute) {
    defaultHeaderAction = <DrawerToggleButton />;
  } else if (isProfileRoute) {
    defaultHeaderAction = <PreviewToggleButton />;
  }
  const headerAction =
    headerActionsContext?.headerActions ?? defaultHeaderAction;

  // Header badge from context (shown after breadcrumb on left side)
  const headerBadge = headerActionsContext?.headerBadge ?? null;

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

  // Memoize context value to prevent unnecessary re-renders
  const tableMetaContextValue = useMemo(
    () => ({ tableMeta, setTableMeta }),
    [tableMeta, setTableMeta]
  );

  return (
    <TableMetaContext.Provider value={tableMetaContextValue}>
      <PreviewPanelProvider enabled={previewEnabled} defaultOpen>
        <AuthShell
          section={config.section}
          navigation={config.navigation}
          breadcrumbs={config.breadcrumbs}
          headerBadge={headerBadge}
          headerAction={headerAction}
          showMobileTabs={config.showMobileTabs}
          drawerContent={config.drawerContent}
          drawerWidth={config.drawerWidth ?? undefined}
          isTableRoute={config.isTableRoute}
          previewPanel={previewEnabled ? <ProfileContactSidebar /> : undefined}
          onSidebarOpenChange={
            persistSidebarCollapsed ? handleSidebarOpenChange : undefined
          }
        >
          {children}
        </AuthShell>
      </PreviewPanelProvider>
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
  children,
}: Readonly<AuthShellWrapperProps>) {
  return (
    <KeyboardShortcutsProvider>
      <HeaderActionsProvider>
        <AuthShellWrapperInner
          persistSidebarCollapsed={persistSidebarCollapsed}
        >
          {children}
        </AuthShellWrapperInner>
        <KeyboardShortcutsHandler />
      </HeaderActionsProvider>
    </KeyboardShortcutsProvider>
  );
}
