'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';
import { AuthLoader } from './AuthLoader';
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
 * 2. Shows AuthLoader while initial data is loading
 * 3. Renders AuthShell with configuration from the hook
 *
 * Separates routing concerns (hook) from layout (AuthShell).
 */
export function AuthShellWrapper({
  persistSidebarCollapsed,
  children,
}: AuthShellWrapperProps) {
  const config = useAuthRouteConfig();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Short delay to prevent flash of loader for fast loads
    // In production, this would wait for actual data loading
    const timer = setTimeout(() => setIsLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <AuthLoader />;
  }

  return (
    <AuthShell
      section={config.section}
      navigation={config.navigation}
      breadcrumbs={config.breadcrumbs}
      headerAction={config.headerAction}
      showMobileTabs={config.showMobileTabs}
      drawerContent={config.drawerContent}
      drawerWidth={config.drawerWidth ?? undefined}
    >
      {children}
    </AuthShell>
  );
}
