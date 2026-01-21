'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useState, useTransition } from 'react';
import { PreviewPanelProvider } from '@/app/app/dashboard/PreviewPanelContext';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { PreviewToggleButton } from '@/components/dashboard/layout/PreviewToggleButton';
import {
  HeaderActionsProvider,
  useOptionalHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';
import { AuthShell } from './AuthShell';

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

  const onSidebarOpenChange = persistSidebarCollapsed
    ? (open: boolean) => {
        startTransition(() => {
          void persistSidebarCollapsed(!open);
        });
      }
    : undefined;

  return (
    <TableMetaContext.Provider value={{ tableMeta, setTableMeta }}>
      <PreviewPanelProvider enabled={previewEnabled}>
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
          onSidebarOpenChange={onSidebarOpenChange}
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
 * 2. Provides HeaderActionsProvider, PreviewPanelProvider and TableMetaContext
 * 3. Renders AuthShell with configuration from the hook
 * 4. Allows pages to override header actions via HeaderActionsContext
 *
 * Separates routing concerns (hook) from layout (AuthShell).
 */
export function AuthShellWrapper({
  persistSidebarCollapsed,
  children,
}: Readonly<AuthShellWrapperProps>) {
  return (
    <HeaderActionsProvider>
      <AuthShellWrapperInner persistSidebarCollapsed={persistSidebarCollapsed}>
        {children}
      </AuthShellWrapperInner>
    </HeaderActionsProvider>
  );
}
