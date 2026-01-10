'use client';

import type { ReactNode } from 'react';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import { SidebarInset, SidebarProvider } from '@/components/organisms/Sidebar';
import { UnifiedDrawer } from '@/components/organisms/UnifiedDrawer';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthShellProps {
  section: 'admin' | 'dashboard' | 'settings';
  navigation: NavItem[];
  breadcrumbs: DashboardBreadcrumbItem[];
  headerAction?: ReactNode;
  showMobileTabs?: boolean;
  drawerContent?: ReactNode;
  drawerWidth?: number;
  isTableRoute?: boolean;
  children: ReactNode;
}

/**
 * AuthShell - Unified layout component for all post-auth pages
 *
 * Pure layout component with 3-panel structure:
 * - Sidebar (dynamic navigation based on section)
 * - Main content area (with header and surface hierarchy)
 * - Optional drawer (contact sidebar, preview panel, etc.)
 *
 * Replaces: DashboardLayoutClient, AdminShell
 */
export function AuthShell({
  section,
  navigation,
  breadcrumbs,
  headerAction,
  showMobileTabs = false,
  drawerContent,
  drawerWidth,
  isTableRoute = false,
  children,
}: AuthShellProps) {
  return (
    <div className='flex h-svh w-full overflow-hidden bg-base'>
      <SidebarProvider>
        <UnifiedSidebar section={section} navigation={navigation} />

        <SidebarInset style={{ marginRight: drawerWidth || 0 }}>
          <div className='mt-2 mb-2 mr-2 ml-0 h-full'>
            <main className='flex-1 min-h-0 overflow-hidden border border-subtle rounded-md h-full'>
              <div className='rounded-lg bg-surface-1 h-full overflow-hidden flex flex-col'>
                <DashboardHeader
                  breadcrumbs={breadcrumbs}
                  action={headerAction}
                  mobileTabs={
                    showMobileTabs ? (
                      <DashboardMobileTabs className='static border-0' />
                    ) : undefined
                  }
                />
                {isTableRoute ? (
                  <div className='flex-1 min-h-0 overflow-hidden'>
                    {children}
                  </div>
                ) : (
                  <div className='flex-1 min-h-0 overflow-y-auto p-4 sm:p-6'>
                    {children}
                  </div>
                )}
              </div>
            </main>
          </div>
        </SidebarInset>

        {drawerContent && (
          <UnifiedDrawer width={drawerWidth}>{drawerContent}</UnifiedDrawer>
        )}
      </SidebarProvider>
    </div>
  );
}
