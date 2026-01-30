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

// Import useTableMeta for internal use and re-export for backward compatibility
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';

export { useTableMeta } from '@/components/organisms/AuthShellWrapper';

import { SkipToContent } from '@/components/atoms';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardSidebar } from '@/components/dashboard/layout/DashboardSidebar';
import { PreviewPanel } from '@/components/dashboard/layout/PreviewPanel';
import { PreviewToggleButton } from '@/components/dashboard/layout/PreviewToggleButton';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { DashboardMobileTabs } from '@/components/dashboard/organisms/DashboardMobileTabs';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/organisms/Sidebar';
import { getBreadcrumbLabel } from '@/lib/constants/breadcrumb-labels';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types';

import type { DashboardData } from './actions';

// ============================================================================
// Breadcrumb Helper Functions (extracted to reduce cognitive complexity)
// ============================================================================

type BreadcrumbMode = 'dashboard' | 'admin' | 'settings';

function determineBreadcrumbMode(
  adminIndex: number,
  settingsIndex: number
): BreadcrumbMode {
  if (settingsIndex >= 0) return 'settings';
  if (adminIndex >= 0) return 'admin';
  return 'dashboard';
}

function extractSubPaths(
  parts: string[],
  mode: BreadcrumbMode,
  dashboardIndex: number,
  adminIndex: number,
  settingsIndex: number,
  appIndex: number
): string[] {
  if (mode === 'dashboard' && dashboardIndex >= 0) {
    return parts.slice(dashboardIndex + 1);
  }
  if (mode === 'admin' && adminIndex >= 0) {
    return parts.slice(adminIndex + 1);
  }
  if (mode === 'settings' && settingsIndex >= 0) {
    return parts.slice(settingsIndex + 1);
  }
  // Handle /app root - no sub-paths
  if (mode === 'dashboard' && appIndex >= 0 && dashboardIndex < 0) {
    return [];
  }
  return [];
}

function getBaseBreadcrumb(mode: BreadcrumbMode): DashboardBreadcrumbItem {
  if (mode === 'admin') return { label: 'Admin', href: '/app/admin' };
  if (mode === 'settings') return { label: 'Settings', href: '/app/settings' };
  return { label: 'Dashboard', href: '/app' };
}

function getBasePath(mode: BreadcrumbMode): string {
  if (mode === 'admin') return '/app/admin';
  if (mode === 'settings') return '/app/settings';
  return '/app/dashboard';
}

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
}: Readonly<DashboardLayoutClientProps>) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });

  // Memoize route checks to avoid recalculating on every render
  const routeFlags = useMemo(() => {
    const isAppDashboardRoute = pathname?.startsWith('/app/dashboard') ?? false;
    const isSettingsRoute = pathname?.startsWith('/app/settings') ?? false;
    const isAdminRoute = pathname?.startsWith('/app/admin') ?? false;
    const isProfileRoute =
      pathname?.startsWith('/app/dashboard/profile') ?? false;
    const isAudienceRoute =
      pathname?.startsWith('/app/dashboard/audience') ?? false;
    const isContactsRoute =
      pathname?.startsWith('/app/dashboard/contacts') ?? false;
    const isFullWidthRoute =
      pathname?.startsWith('/app/admin/creators') ||
      pathname?.startsWith('/app/admin/users') ||
      pathname?.startsWith('/app/admin/waitlist') ||
      isAudienceRoute ||
      isContactsRoute ||
      pathname?.startsWith('/app/dashboard/releases');
    const isContactTableRoute =
      pathname?.startsWith('/app/admin/creators') || isAudienceRoute;

    return {
      isAppDashboardRoute,
      isSettingsRoute,
      isAdminRoute,
      isProfileRoute,
      isAudienceRoute,
      isContactsRoute,
      isFullWidthRoute,
      isContactTableRoute,
    };
  }, [pathname]);

  const {
    isAppDashboardRoute,
    isSettingsRoute,
    isAdminRoute,
    isProfileRoute,
    isAudienceRoute,
    isFullWidthRoute,
    isContactTableRoute,
  } = routeFlags;

  const useFullWidth = fullWidth || isFullWidthRoute;
  const resolvedPreviewEnabled =
    previewEnabled && isAppDashboardRoute && isProfileRoute;
  const showMobileTabs =
    isAppDashboardRoute && !isSettingsRoute && !isAdminRoute;

  // Build a simple breadcrumb from the current path
  const crumbs = useMemo(() => {
    const parts = (pathname || '/app').split('/').filter(Boolean);
    const dashboardIndex = parts.indexOf('dashboard');
    const adminIndex = parts.indexOf('admin');
    const settingsIndex = parts.indexOf('settings');
    const appIndex = parts.indexOf('app');

    const mode = determineBreadcrumbMode(adminIndex, settingsIndex);
    const subs = extractSubPaths(
      parts,
      mode,
      dashboardIndex,
      adminIndex,
      settingsIndex,
      appIndex
    );
    const items: DashboardBreadcrumbItem[] = [getBaseBreadcrumb(mode)];

    if (subs.length > 0) {
      let acc = getBasePath(mode);
      subs.forEach((seg, i) => {
        acc += `/${seg}`;
        const isLast = i === subs.length - 1;
        items.push({
          label: getBreadcrumbLabel(seg),
          href: isLast ? undefined : acc,
        });
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
    const storageKey = 'dashboard.sidebarCollapsed';

    try {
      const stored = localStorage.getItem(storageKey);
      const storedIsOpen = stored === '0';
      const storageValue = serverValue ? '0' : '1';

      // If no stored value or values differ, sync storage with server
      if (stored === null || storedIsOpen !== serverValue) {
        localStorage.setItem(storageKey, storageValue);
        setSidebarOpen(serverValue);
        return;
      }

      // Use stored value
      setSidebarOpen(storedIsOpen);
    } catch {
      // Ignore storage errors (private browsing, quota exceeded, etc.)
    }
  }, [dashboardData.sidebarCollapsed]);

  const layout = (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
        <TableMetaContext.Provider
          value={useMemo(() => ({ tableMeta, setTableMeta }), [tableMeta])}
        >
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

/**
 * Shared layout wrapper for all dashboard routes
 */
function DashboardLayoutWrapper({
  crumbs,
  useFullWidth,
  showMobileTabs,
  headerAction,
  contentPadding,
  showDivider,
  showPreview,
  children,
}: Readonly<{
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  showMobileTabs: boolean;
  headerAction: React.ReactNode;
  contentPadding: string;
  showDivider?: boolean;
  showPreview: boolean;
  children: React.ReactNode;
}>) {
  const { toggleSidebar, openMobile, isMobile, state } = useSidebar();

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
                showDivider={showDivider}
                action={headerAction}
              />
              <div className='flex-1 min-h-0 overflow-hidden flex relative'>
                <div
                  className={cn(
                    'flex-1 min-h-0',
                    contentPadding,
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
        </main>
        {showMobileTabs ? <DashboardMobileTabs /> : null}
      </SidebarInset>
    </div>
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
}: Readonly<{
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  isContactTableRoute: boolean;
  isProfileRoute: boolean;
  isAudienceRoute: boolean;
  previewEnabled: boolean;
  showMobileTabs: boolean;
  children: React.ReactNode;
}>) {
  const previewContext = usePreviewPanelContext();
  const previewOpen = previewContext?.isOpen ?? false;
  const closePreview = previewContext?.close;
  const { tableMeta } = useTableMeta();

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

  if (isContactTableRoute) {
    const ContactToggleButton = (
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
    );

    return (
      <DashboardLayoutWrapper
        crumbs={crumbs}
        useFullWidth={useFullWidth}
        showMobileTabs={showMobileTabs}
        headerAction={ContactToggleButton}
        contentPadding='overflow-hidden'
        showDivider={true}
        showPreview={false}
      >
        {children}
      </DashboardLayoutWrapper>
    );
  }

  return (
    <DashboardLayoutWrapper
      crumbs={crumbs}
      useFullWidth={useFullWidth}
      showMobileTabs={showMobileTabs}
      headerAction={previewEnabled ? <PreviewToggleButton /> : null}
      contentPadding='overflow-y-auto p-4 sm:p-6'
      showDivider={false}
      showPreview={showPreview}
    >
      {children}
    </DashboardLayoutWrapper>
  );
}
