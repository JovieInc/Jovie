'use client';

import { Button } from '@jovie/ui';
import { Menu, Users, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React, {
  createContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';

// Re-export and import useTableMeta from AuthShellWrapper for backward compatibility
export { useTableMeta } from '@/components/organisms/AuthShellWrapper';

import { SkipToContent } from '@/components/atoms';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardSidebar } from '@/components/dashboard/layout/DashboardSidebar';
import { PreviewPanel } from '@/components/dashboard/layout/PreviewPanel';
import { PreviewToggleButton } from '@/components/dashboard/layout/PreviewToggleButton';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types';

import type { DashboardData } from './actions';
import {
  PreviewPanelProvider,
  usePreviewPanelContext,
} from './PreviewPanelContext';

// TableMeta types moved to AuthShellWrapper - kept here for reference only
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

interface DashboardLayoutClientProps {
  dashboardData: DashboardData;
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: React.ReactNode;
  /** If true, content area uses full width without max-w constraint */
  fullWidth?: boolean;
  previewEnabled?: boolean;
}

export default function DashboardLayoutClient({
  dashboardData,
  persistSidebarCollapsed,
  children,
  fullWidth = false,
  previewEnabled = true,
}: DashboardLayoutClientProps) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const isAppDashboardRoute = pathname?.startsWith('/app/dashboard') ?? false;
  const isSettingsRoute = pathname?.startsWith('/app/settings') ?? false;
  const isAdminRoute = pathname?.startsWith('/app/admin') ?? false;
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });

  // Routes that should use full width layout
  const isFullWidthRoute =
    pathname?.startsWith('/app/admin/creators') ||
    pathname?.startsWith('/app/admin/users') ||
    pathname?.startsWith('/app/admin/waitlist') ||
    pathname?.startsWith('/app/dashboard/audience') ||
    pathname?.startsWith('/app/dashboard/releases');
  const isContactTableRoute =
    pathname?.startsWith('/app/admin/creators') ||
    pathname?.startsWith('/app/dashboard/audience');
  const isProfileRoute =
    pathname?.startsWith('/app/dashboard/profile') ?? false;
  const isAudienceRoute =
    pathname?.startsWith('/app/dashboard/audience') ?? false;
  const useFullWidth = fullWidth || isFullWidthRoute;
  const resolvedPreviewEnabled =
    previewEnabled && isAppDashboardRoute && isProfileRoute;
  const showMobileTabs =
    isAppDashboardRoute && !isSettingsRoute && !isAdminRoute;

  // Build a simple breadcrumb from the current path
  const crumbs = useMemo(() => {
    const parts = (pathname || '/app/dashboard').split('/').filter(Boolean);
    const dashboardIndex = parts.indexOf('dashboard');
    const adminIndex = parts.indexOf('admin');
    const settingsIndex = parts.indexOf('settings');

    const mode: 'dashboard' | 'admin' | 'settings' =
      settingsIndex >= 0 ? 'settings' : adminIndex >= 0 ? 'admin' : 'dashboard';

    const subs =
      mode === 'dashboard'
        ? dashboardIndex >= 0
          ? parts.slice(dashboardIndex + 1)
          : []
        : mode === 'admin'
          ? adminIndex >= 0
            ? parts.slice(adminIndex + 1)
            : []
          : settingsIndex >= 0
            ? parts.slice(settingsIndex + 1)
            : [];
    const toTitle = (s: string): string =>
      s.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());

    const items: DashboardBreadcrumbItem[] =
      mode === 'admin'
        ? [{ label: 'Admin', href: '/app/admin' }]
        : mode === 'settings'
          ? [{ label: 'Settings', href: '/app/settings' }]
          : [{ label: 'Dashboard', href: '/app/dashboard' }];
    if (subs.length > 0) {
      let acc =
        mode === 'admin'
          ? '/app/admin'
          : mode === 'settings'
            ? '/app/settings'
            : '/app/dashboard';
      subs.forEach((seg, i) => {
        acc += `/${seg}`;
        const isLast = i === subs.length - 1;
        items.push({ label: toTitle(seg), href: isLast ? undefined : acc });
      });
    }
    return items;
  }, [pathname]);

  // For sidebar-08 pattern, we'll use the built-in state management
  const [sidebarOpen, setSidebarOpen] = useState(
    !(dashboardData.sidebarCollapsed ?? false)
  );

  // Handle persistence of sidebar state
  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    if (persistSidebarCollapsed) {
      startTransition(() => {
        void persistSidebarCollapsed(!open);
      });
    }
  };

  // Sync with localStorage
  useEffect(() => {
    const serverValue = !(dashboardData.sidebarCollapsed ?? false);
    try {
      const stored = localStorage.getItem('dashboard.sidebarCollapsed');
      if (stored === null) {
        localStorage.setItem(
          'dashboard.sidebarCollapsed',
          serverValue ? '0' : '1'
        );
        setSidebarOpen(serverValue);
      } else {
        const storedBool = stored === '0';
        if (storedBool !== serverValue) {
          localStorage.setItem(
            'dashboard.sidebarCollapsed',
            serverValue ? '0' : '1'
          );
          setSidebarOpen(serverValue);
        } else {
          setSidebarOpen(storedBool);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [dashboardData.sidebarCollapsed]);

  const layout = (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
        <TableMetaContext.Provider value={{ tableMeta, setTableMeta }}>
          <DashboardLayoutInner
            crumbs={crumbs}
            useFullWidth={useFullWidth}
            isContactTableRoute={isContactTableRoute}
            isProfileRoute={isProfileRoute}
            isAudienceRoute={isAudienceRoute}
            previewEnabled={resolvedPreviewEnabled}
            showMobileTabs={showMobileTabs}
          >
            {children}
          </DashboardLayoutInner>
        </TableMetaContext.Provider>
      </SidebarProvider>
    </>
  );

  if (!resolvedPreviewEnabled) {
    return layout;
  }

  return (
    <PreviewPanelProvider
      enabled={resolvedPreviewEnabled}
      defaultOpen={isProfileRoute}
    >
      {layout}
    </PreviewPanelProvider>
  );
}

/** Inner component that can access preview panel context */
function DashboardLayoutInner({
  crumbs,
  useFullWidth,
  isContactTableRoute,
  isProfileRoute,
  isAudienceRoute,
  previewEnabled,
  showMobileTabs,
  children,
}: {
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  isContactTableRoute: boolean;
  isProfileRoute: boolean;
  isAudienceRoute: boolean;
  previewEnabled: boolean;
  showMobileTabs: boolean;
  children: React.ReactNode;
}) {
  const previewContext = usePreviewPanelContext();
  const previewOpen = previewContext?.isOpen ?? false;
  const closePreview = previewContext?.close;
  const { tableMeta } = useTableMeta();
  const { toggleSidebar, openMobile, isMobile } = useSidebar();

  const showPreview =
    previewEnabled &&
    !!previewContext &&
    isProfileRoute &&
    !isContactTableRoute;

  // Ensure preview is closed/hidden on contact-table routes
  useEffect(() => {
    if (isContactTableRoute && previewOpen) {
      closePreview?.();
    }
  }, [isContactTableRoute, previewOpen, closePreview]);

  const ContactToggleButton = isContactTableRoute ? (
    <Button
      variant='ghost'
      size='icon'
      onClick={() => tableMeta.toggle?.()}
      aria-label='Toggle contact details'
      className='h-9 w-9'
      disabled={!tableMeta.toggle}
    >
      <Users className='h-5 w-5' />
    </Button>
  ) : null;

  const MobileMenuButton = isMobile ? (
    <Button
      variant='ghost'
      size='icon'
      onClick={toggleSidebar}
      aria-label={openMobile ? 'Close menu' : 'Open menu'}
      aria-expanded={openMobile}
      className='h-11 w-11'
    >
      {openMobile ? <X className='h-6 w-6' /> : <Menu className='h-6 w-6' />}
    </Button>
  ) : null;

  const { state } = useSidebar();

  const SidebarExpandButton =
    !isMobile && state === 'closed' ? <SidebarTrigger /> : null;

  return (
    <div className='flex h-svh w-full overflow-hidden bg-base'>
      <SkipToContent />
      <DashboardSidebar />
      <SidebarInset className='flex flex-1 flex-col overflow-hidden bg-base'>
        <main
          id='main-content'
          className='flex-1 min-h-0 overflow-hidden bg-base'
        >
          {isContactTableRoute ? (
            <div
              className={cn(
                'p-1',
                useFullWidth
                  ? 'w-full h-full min-h-0'
                  : 'container mx-auto max-w-7xl h-full'
              )}
            >
              <div className='rounded-lg bg-(--color-bg-surface-1) h-full overflow-hidden flex flex-col'>
                <DashboardHeader
                  breadcrumbs={crumbs}
                  leading={MobileMenuButton}
                  sidebarTrigger={SidebarExpandButton}
                  showDivider={true}
                  action={<>{ContactToggleButton}</>}
                />
                <div className='flex-1 min-h-0 overflow-hidden flex'>
                  <div
                    className={cn(
                      'flex-1 min-h-0 overflow-hidden',
                      showMobileTabs
                        ? 'pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-0'
                        : undefined
                    )}
                  >
                    {children}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'p-1',
                useFullWidth
                  ? 'w-full h-full min-h-0'
                  : 'container mx-auto max-w-7xl h-full'
              )}
            >
              <div className='rounded-lg bg-(--color-bg-surface-1) h-full overflow-hidden flex flex-col'>
                <DashboardHeader
                  breadcrumbs={crumbs}
                  leading={MobileMenuButton}
                  sidebarTrigger={SidebarExpandButton}
                  action={
                    <>{previewEnabled ? <PreviewToggleButton /> : null}</>
                  }
                />
                <div className='flex-1 min-h-0 overflow-hidden flex relative'>
                  <div
                    className={cn(
                      'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6',
                      showMobileTabs
                        ? 'pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-0'
                        : undefined
                    )}
                  >
                    {children}
                  </div>
                  {showPreview && <PreviewPanel />}
                </div>
              </div>
            </div>
          )}
        </main>
        {showMobileTabs ? <DashboardMobileTabs /> : null}
      </SidebarInset>
    </div>
  );
}
