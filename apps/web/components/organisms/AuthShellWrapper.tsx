'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { PreviewPanelProvider } from '@/app/app/dashboard/PreviewPanelContext';
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
  setTableMeta: (meta: TableMeta | ((prev: TableMeta) => TableMeta)) => void;
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
 * AuthShellWrapper - Client wrapper using routing hook to render AuthShell
 *
 * This component:
 * 1. Uses useAuthRouteConfig hook to get all routing-based configuration
 * 2. Provides PreviewPanelProvider and TableMetaContext
 * 3. Renders AuthShell with configuration from the hook
 *
 * Separates routing concerns (hook) from layout (AuthShell).
 */
export function AuthShellWrapper({
  persistSidebarCollapsed,
  children,
}: AuthShellWrapperProps) {
  const config = useAuthRouteConfig();
  const pathname = usePathname();

  // TableMeta state for audience/creators tables
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });

  // Determine if preview panel should be enabled (profile route only)
  const isProfileRoute =
    pathname?.startsWith('/app/dashboard/profile') ?? false;
  const previewEnabled = config.section === 'dashboard' && isProfileRoute;

  return (
    <TableMetaContext.Provider value={{ tableMeta, setTableMeta }}>
      <PreviewPanelProvider enabled={previewEnabled}>
        <AuthShell
          section={config.section}
          navigation={config.navigation}
          breadcrumbs={config.breadcrumbs}
          headerAction={config.headerAction}
          showMobileTabs={config.showMobileTabs}
          drawerContent={config.drawerContent}
          drawerWidth={config.drawerWidth ?? undefined}
          isTableRoute={config.isTableRoute}
        >
          {children}
        </AuthShell>
      </PreviewPanelProvider>
    </TableMetaContext.Provider>
  );
}
