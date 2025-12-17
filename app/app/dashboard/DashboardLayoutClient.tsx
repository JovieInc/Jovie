'use client';

import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { usePathname } from 'next/navigation';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardThemeToggleButton } from '@/components/dashboard/atoms/DashboardThemeToggleButton';
import { DashboardSidebar } from '@/components/dashboard/layout/DashboardSidebar';
import {
  PREVIEW_PANEL_WIDTH,
  PreviewPanel,
} from '@/components/dashboard/layout/PreviewPanel';
import { PreviewToggleButton } from '@/components/dashboard/layout/PreviewToggleButton';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { SidebarInset, SidebarProvider } from '@/components/organisms/Sidebar';
import type { DashboardBreadcrumbItem } from '@/types';
import type { DashboardData } from './actions';
import { DashboardDataProvider } from './DashboardDataContext';
import { PreviewPanelProvider, usePreviewPanel } from './PreviewPanelContext';
import {
  persistSidebarPreference,
  readSidebarPreference,
} from './sidebarPreference';

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
    throw new Error('useTableMeta must be used within DashboardLayoutClient');
  }
  return ctx;
}

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
  const renderCountRef = useRef(0);
  const [tableMeta, setTableMeta] = useState<TableMeta>({
    rowCount: null,
    toggle: null,
  });
  const serverSidebarOpen = !(dashboardData.sidebarCollapsed ?? false);
  const [sidebarPreference, setSidebarPreference] = useState(() =>
    readSidebarPreference(serverSidebarOpen)
  );
  const sidebarOpen = sidebarPreference.open;

  // Routes that should use full width layout
  const isFullWidthRoute =
    pathname?.startsWith('/app/admin/creators') ||
    pathname?.startsWith('/app/admin/users') ||
    pathname?.startsWith('/app/admin/waitlist') ||
    pathname?.startsWith('/app/dashboard/audience');
  const isContactTableRoute =
    pathname?.startsWith('/app/admin/creators') ||
    pathname?.startsWith('/app/dashboard/audience');
  const isProfileRoute =
    pathname?.startsWith('/app/dashboard/profile') ?? false;
  const isAudienceRoute =
    pathname?.startsWith('/app/dashboard/audience') ?? false;
  const useFullWidth = fullWidth || isFullWidthRoute;
  const resolvedPreviewEnabled = previewEnabled && isAppDashboardRoute;

  // Build a simple breadcrumb from the current path
  const crumbs = (() => {
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
          : [{ label: 'Dashboard', href: '/app/dashboard/overview' }];
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
  })();

  // Handle persistence of sidebar state
  const handleOpenChange = (open: boolean) => {
    if (open === sidebarPreference.open) {
      return;
    }

    setSidebarPreference({
      open,
      hasStoredPreference: true,
    });
    persistSidebarPreference(open);
    if (persistSidebarCollapsed) {
      startTransition(() => {
        void persistSidebarCollapsed(!open);
      });
    }
  };

  // Sync with server-provided value when there's no stored preference
  useEffect(() => {
    if (sidebarPreference.hasStoredPreference) {
      return;
    }

    setSidebarPreference(prev =>
      prev.open === serverSidebarOpen
        ? prev
        : { ...prev, open: serverSidebarOpen }
    );
  }, [serverSidebarOpen, sidebarPreference.hasStoredPreference]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'development' ||
      typeof window === 'undefined'
    ) {
      return;
    }

    renderCountRef.current += 1;
    const debugWindow = window as typeof window & {
      __dashboardLayoutRenderCount?: number;
    };
    debugWindow.__dashboardLayoutRenderCount = renderCountRef.current;
  });

  return (
    <DashboardDataProvider value={dashboardData}>
      <PreviewPanelProvider enabled={resolvedPreviewEnabled}>
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
            >
              {children}
            </DashboardLayoutInner>
          </TableMetaContext.Provider>
        </SidebarProvider>
      </PreviewPanelProvider>
    </DashboardDataProvider>
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
  children,
}: {
  crumbs: DashboardBreadcrumbItem[];
  useFullWidth: boolean;
  isContactTableRoute: boolean;
  isProfileRoute: boolean;
  isAudienceRoute: boolean;
  previewEnabled: boolean;
  children: React.ReactNode;
}) {
  const { isOpen: previewOpen, close: closePreview } = usePreviewPanel();
  const { tableMeta } = useTableMeta();

  const showPreview = previewEnabled && isProfileRoute && !isContactTableRoute;

  // Ensure preview is closed/hidden on contact-table routes
  useEffect(() => {
    if (isContactTableRoute && previewOpen) {
      closePreview();
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
      <UserGroupIcon className='h-5 w-5' />
    </Button>
  ) : null;

  return (
    <div className='flex h-svh w-full overflow-hidden bg-base'>
      <DashboardSidebar />
      <SidebarInset
        className='flex flex-1 flex-col overflow-hidden transition-[margin-right] duration-300 ease-out'
        style={{
          marginRight: isContactTableRoute
            ? (tableMeta.rightPanelWidth ?? 0)
            : !previewOpen
              ? 0
              : PREVIEW_PANEL_WIDTH,
        }}
      >
        <DashboardHeader
          breadcrumbs={crumbs}
          action={
            <>
              <DashboardThemeToggleButton />
              {isContactTableRoute ? (
                ContactToggleButton
              ) : showPreview ? (
                <PreviewToggleButton />
              ) : null}
            </>
          }
        />
        <main
          className={
            isContactTableRoute
              ? 'flex-1 min-h-0 overflow-hidden'
              : 'flex-1 min-h-0 overflow-auto'
          }
        >
          <div
            className={
              useFullWidth
                ? isContactTableRoute
                  ? isAudienceRoute
                    ? 'w-full h-full min-h-0'
                    : 'w-full h-full min-h-0 p-4 sm:p-6'
                  : 'w-full px-4 sm:px-6 py-6'
                : 'container mx-auto max-w-7xl p-6'
            }
          >
            {children}
          </div>
        </main>
      </SidebarInset>
      {showPreview && <PreviewPanel />}
    </div>
  );
}
