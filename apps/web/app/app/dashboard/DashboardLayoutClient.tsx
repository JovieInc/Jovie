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

function toTitleCase(s: string): string {
  return s.replaceAll('-', ' ').replaceAll(/\b\w/g, ch => ch.toUpperCase());
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
        items.push({ label: toTitleCase(seg), href: isLast ? undefined : acc });
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

function getMobileTabsPadding(showMobileTabs: boolean): string | undefined {
  return showMobileTabs
    ? 'pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-0'
    : undefined;
}

function getContainerClass(useFullWidth: boolean): string {
  return cn(
    'p-1',
    useFullWidth
      ? 'w-full h-full min-h-0'
      : 'container mx-auto max-w-7xl h-full'
  );
}

function ContactTableLayout({
  crumbs,
  useFullWidth,
  showMobileTabs,
  mobileMenuButton,
  sidebarExpandButton,
  contactToggleButton,
  children,
}: {
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  showMobileTabs: boolean;
  mobileMenuButton: React.ReactNode;
  sidebarExpandButton: React.ReactNode;
  contactToggleButton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={getContainerClass(useFullWidth)}>
      <div className='rounded-lg bg-(--color-bg-surface-1) h-full overflow-hidden flex flex-col'>
        <DashboardHeader
          breadcrumbs={crumbs}
          leading={mobileMenuButton}
          sidebarTrigger={sidebarExpandButton}
          showDivider={true}
          action={contactToggleButton}
        />
        <div className='flex-1 min-h-0 overflow-hidden flex'>
          <div
            className={cn(
              'flex-1 min-h-0 overflow-hidden',
              getMobileTabsPadding(showMobileTabs)
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function StandardLayout({
  crumbs,
  useFullWidth,
  showMobileTabs,
  previewEnabled,
  showPreview,
  mobileMenuButton,
  sidebarExpandButton,
  children,
}: {
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  showMobileTabs: boolean;
  previewEnabled: boolean;
  showPreview: boolean;
  mobileMenuButton: React.ReactNode;
  sidebarExpandButton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={getContainerClass(useFullWidth)}>
      <div className='rounded-lg bg-(--color-bg-surface-1) h-full overflow-hidden flex flex-col'>
        <DashboardHeader
          breadcrumbs={crumbs}
          leading={mobileMenuButton}
          sidebarTrigger={sidebarExpandButton}
          action={previewEnabled ? <PreviewToggleButton /> : null}
        />
        <div className='flex-1 min-h-0 overflow-hidden flex relative'>
          <div
            className={cn(
              'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6',
              getMobileTabsPadding(showMobileTabs)
            )}
          >
            {children}
          </div>
          {showPreview && <PreviewPanel />}
        </div>
      </div>
    </div>
  );
}

/** Inner component that can access preview panel context */
function DashboardLayoutInner({
  crumbs,
  useFullWidth,
  isContactTableRoute,
  isProfileRoute,
  previewEnabled,
  showMobileTabs,
  children,
}: {
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  isContactTableRoute: boolean;
  isProfileRoute: boolean;
  previewEnabled: boolean;
  showMobileTabs: boolean;
  children: React.ReactNode;
}) {
  const previewContext = usePreviewPanelContext();
  const previewOpen = previewContext?.isOpen ?? false;
  const closePreview = previewContext?.close;
  const { tableMeta } = useTableMeta();
  const { toggleSidebar, openMobile, isMobile, state } = useSidebar();

  const showPreview =
    previewEnabled &&
    !!previewContext &&
    isProfileRoute &&
    !isContactTableRoute;

  useEffect(() => {
    if (isContactTableRoute && previewOpen) {
      closePreview?.();
    }
  }, [isContactTableRoute, previewOpen, closePreview]);

  const contactToggleButton = isContactTableRoute ? (
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

  const mobileMenuButton = isMobile ? (
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

  const sidebarExpandButton =
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
            <ContactTableLayout
              crumbs={crumbs}
              useFullWidth={useFullWidth}
              showMobileTabs={showMobileTabs}
              mobileMenuButton={mobileMenuButton}
              sidebarExpandButton={sidebarExpandButton}
              contactToggleButton={contactToggleButton}
            >
              {children}
            </ContactTableLayout>
          ) : (
            <StandardLayout
              crumbs={crumbs}
              useFullWidth={useFullWidth}
              showMobileTabs={showMobileTabs}
              previewEnabled={previewEnabled}
              showPreview={showPreview}
              mobileMenuButton={mobileMenuButton}
              sidebarExpandButton={sidebarExpandButton}
            >
              {children}
            </StandardLayout>
          )}
        </main>
        {showMobileTabs ? <DashboardMobileTabs /> : null}
      </SidebarInset>
    </div>
  );
}
