'use client';

import type { ReactNode } from 'react';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { useTablePanel } from '@/contexts/TablePanelContext';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface AuthShellProps {
  readonly section: 'admin' | 'dashboard' | 'settings';
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  /** Badge/pill shown after breadcrumb (left side) */
  readonly headerBadge?: ReactNode;
  /** Actions shown on right side of header */
  readonly headerAction?: ReactNode;
  readonly showMobileTabs?: boolean;
  readonly isTableRoute?: boolean;
  /** Preview panel slot (rendered alongside main content) */
  readonly previewPanel?: ReactNode;
  readonly onSidebarOpenChange?: (open: boolean) => void;
  /** Server-provided sidebar default open state (from cookie). Eliminates layout flash. */
  readonly sidebarDefaultOpen?: boolean;
  readonly children: ReactNode;
}

/**
 * AuthShellInner - Inner component that has access to sidebar context
 */
function AuthShellInner({
  section,
  breadcrumbs,
  headerBadge,
  headerAction,
  showMobileTabs = false,
  isTableRoute = false,
  previewPanel,
  children,
}: Readonly<Omit<AuthShellProps, 'children'> & { children: ReactNode }>) {
  const { isMobile, state } = useSidebar();
  const tablePanel = useTablePanel();

  // Sidebar expand button (desktop only, when collapsed)
  const sidebarTrigger =
    !isMobile && state === 'closed' ? <SidebarTrigger /> : null;

  const isInSettings = section === 'settings';

  return (
    <>
      <UnifiedSidebar section={section} />

      <SidebarInset className='bg-surface-1 lg:border-[0.5px] lg:border-default lg:rounded-[4px_4px_12px_4px] lg:m-2 lg:ml-0'>
        {!isInSettings && (
          <DashboardHeader
            breadcrumbs={breadcrumbs}
            sidebarTrigger={sidebarTrigger}
            breadcrumbSuffix={headerBadge}
            action={headerAction}
            showDivider={isTableRoute}
          />
        )}
        {isTableRoute ? (
          <div
            className={cn(
              'flex-1 min-h-0 overflow-hidden flex',
              showMobileTabs && 'pb-20 lg:pb-6'
            )}
          >
            <div className='flex-1 min-h-0 min-w-0 overflow-hidden overflow-x-auto'>
              {children}
            </div>
            {tablePanel}
          </div>
        ) : (
          <div className='flex-1 min-h-0 overflow-hidden flex'>
            <div
              className={cn(
                'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6',
                showMobileTabs && 'pb-20 lg:pb-6'
              )}
            >
              {children}
            </div>
            {previewPanel}
          </div>
        )}
      </SidebarInset>

      {showMobileTabs && <DashboardMobileTabs />}
    </>
  );
}

/**
 * AuthShell - Unified layout component for all post-auth pages
 *
 * Pure layout component with 2-panel structure:
 * - Sidebar (dynamic navigation based on section)
 * - Main content area (with header, surface hierarchy, and optional preview panel)
 *
 * Right drawers (contact/release/audience detail panels) are rendered
 * by individual page components using the shared RightDrawer shell.
 */
export function AuthShell(props: Readonly<AuthShellProps>) {
  const { onSidebarOpenChange, sidebarDefaultOpen, ...rest } = props;

  return (
    <div className='flex h-svh w-full overflow-hidden bg-base'>
      <SidebarProvider
        defaultOpen={sidebarDefaultOpen}
        onOpenChange={onSidebarOpenChange}
      >
        <AuthShellInner {...rest} />
      </SidebarProvider>
    </div>
  );
}
