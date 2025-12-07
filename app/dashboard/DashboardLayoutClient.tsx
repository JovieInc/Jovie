'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import { DashboardSidebar } from '@/components/dashboard/layout/DashboardSidebar';
import {
  type DashboardBreadcrumbItem,
  DashboardTopBar,
} from '@/components/dashboard/layout/DashboardTopBar';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { SidebarInset, SidebarProvider } from '@/components/organisms/Sidebar';

import type { DashboardData } from './actions';
import { DashboardDataProvider } from './DashboardDataContext';

interface DashboardLayoutClientProps {
  dashboardData: DashboardData;
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: React.ReactNode;
  /** If true, content area uses full width without max-w constraint */
  fullWidth?: boolean;
}

export default function DashboardLayoutClient({
  dashboardData,
  persistSidebarCollapsed,
  children,
  fullWidth = false,
}: DashboardLayoutClientProps) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();

  // Routes that should use full width layout
  const isFullWidthRoute = pathname?.startsWith('/admin/users') ?? false;
  const useFullWidth = fullWidth || isFullWidthRoute;

  // Build a simple breadcrumb from the current path
  const crumbs = (() => {
    const parts = (pathname || '/dashboard').split('/').filter(Boolean);
    const idx = parts.indexOf('dashboard');
    const subs = idx >= 0 ? parts.slice(idx + 1) : [];
    const toTitle = (s: string): string =>
      s.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    const items: DashboardBreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard/overview' },
    ];
    if (subs.length > 0) {
      let acc = '/dashboard';
      subs.forEach((seg, i) => {
        acc += `/${seg}`;
        const isLast = i === subs.length - 1;
        items.push({ label: toTitle(seg), href: isLast ? undefined : acc });
      });
    }
    return items;
  })();

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

  return (
    <DashboardDataProvider value={dashboardData}>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider open={sidebarOpen} onOpenChange={handleOpenChange}>
        <div className='flex h-svh w-full overflow-hidden bg-base'>
          <DashboardSidebar />
          <SidebarInset className='flex flex-1 flex-col overflow-hidden'>
            <DashboardTopBar breadcrumbs={crumbs} />
            <main className='flex-1 min-h-0 overflow-auto'>
              <div
                className={
                  useFullWidth ? 'p-6' : 'container mx-auto max-w-7xl p-6'
                }
              >
                {children}
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </DashboardDataProvider>
  );
}
