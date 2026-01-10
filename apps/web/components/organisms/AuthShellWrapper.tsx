'use client';

import type { ReactNode } from 'react';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';
import { AuthShell } from './AuthShell';

export interface AuthShellWrapperProps {
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: ReactNode;
}

/**
 * AuthShellWrapper - Client wrapper using routing hook to render AuthShell
 *
 * This component:
 * 1. Uses useAuthRouteConfig hook to get all routing-based configuration
 * 2. Renders AuthShell with configuration from the hook
 *
 * Separates routing concerns (hook) from layout (AuthShell).
 */
export function AuthShellWrapper({
  persistSidebarCollapsed,
  children,
}: AuthShellWrapperProps) {
  const config = useAuthRouteConfig();

  return (
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
  );
}
