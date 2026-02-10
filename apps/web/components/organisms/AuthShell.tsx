'use client';

import type { ReactNode } from 'react';
import type { NavItem } from '@/components/dashboard/dashboard-nav/types';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UnifiedDrawer } from '@/components/organisms/UnifiedDrawer';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthShellProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
  readonly navigation: NavItem[];
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  /** Badge/pill shown after breadcrumb (left side) */
  readonly headerBadge?: ReactNode;
  /** Actions shown on right side of header */
  readonly headerAction?: ReactNode;
  readonly showMobileTabs?: boolean;
  readonly drawerContent?: ReactNode;
  readonly drawerWidth?: number;
  readonly isTableRoute?: boolean;
  /** Preview panel slot (rendered alongside main content) */
  readonly previewPanel?: ReactNode;
  readonly onSidebarOpenChange?: (open: boolean) => void;
  readonly children: ReactNode;
}

/**
 * AuthShellInner - Inner component that has access to sidebar context
 */
function AuthShellInner({
  section,
  navigation,
  breadcrumbs,
  headerBadge,
  headerAction,
  showMobileTabs = false,
  drawerContent,
  drawerWidth,
  isTableRoute = false,
  previewPanel,
  children,
}: Readonly<Omit<AuthShellProps, 'children'> & { children: ReactNode }>) {
  const { isMobile, state } = useSidebar();

  // Mobile menu button - hidden on mobile since bottom tab bar handles navigation
  const MobileMenuButton = null;

  // Sidebar expand button (desktop only, when collapsed)
  const SidebarExpandButton =
    !isMobile && state === 'closed' ? <SidebarTrigger /> : null;

  return (
    <>
      <UnifiedSidebar section={section} navigation={navigation} />

      <SidebarInset className='bg-surface-1 lg:border-[0.5px] lg:border-default lg:rounded-[4px_4px_12px_4px] lg:m-2 lg:ml-0'>
        <DashboardHeader
          breadcrumbs={breadcrumbs}
          leading={MobileMenuButton}
          sidebarTrigger={SidebarExpandButton}
          breadcrumbSuffix={headerBadge}
          action={headerAction}
          showDivider={isTableRoute}
          mobileTabs={
            showMobileTabs ? (
              <DashboardMobileTabs className='static border-0' />
            ) : undefined
          }
        />
        {isTableRoute ? (
          <div className='flex-1 min-h-0 min-w-0 overflow-hidden overflow-x-auto'>
            {children}
          </div>
        ) : (
          <div className='flex-1 min-h-0 overflow-hidden flex'>
            <div className='flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6'>
              {children}
            </div>
            {previewPanel}
          </div>
        )}
      </SidebarInset>

      {drawerContent && (
        <UnifiedDrawer width={drawerWidth}>{drawerContent}</UnifiedDrawer>
      )}
    </>
  );
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
export function AuthShell(props: Readonly<AuthShellProps>) {
  const { onSidebarOpenChange, ...rest } = props;

  return (
    <div className='flex h-svh w-full overflow-hidden bg-base'>
      <SidebarProvider onOpenChange={onSidebarOpenChange}>
        <AuthShellInner {...rest} />
      </SidebarProvider>
    </div>
  );
}
