'use client';

import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { PendingClaimRunner } from '@/components/bridge/PendingClaimRunner';
import {
  type DashboardBreadcrumbItem,
  DashboardTopBar,
} from '@/components/dashboard/layout/DashboardTopBar';
import { PendingClaimHandler } from '@/components/dashboard/PendingClaimHandler';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import type { DashboardData } from './actions';

interface DashboardLayoutClientProps {
  dashboardData: DashboardData;
  persistSidebarCollapsed?: (collapsed: boolean) => Promise<void>;
  children: React.ReactNode;
}

export default function DashboardLayoutClient({
  dashboardData,
  persistSidebarCollapsed,
  children,
}: DashboardLayoutClientProps) {
  const [, startTransition] = useTransition();
  const pathname = usePathname();

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

  // Simplified sidebar state - ensure sidebar is open by default unless explicitly collapsed
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

  return (
    <>
      <PendingClaimRunner />
      <PendingClaimHandler />

      <SidebarProvider
        defaultOpen={true}
        open={sidebarOpen}
        onOpenChange={handleOpenChange}
      >
        <div className='flex min-h-screen w-full bg-base'>
          <AppSidebar
            user={{
              name: dashboardData.user?.name,
              email: dashboardData.user?.email,
              avatar: dashboardData.user?.imageUrl,
            }}
          />
          <SidebarInset className='flex flex-1 flex-col'>
            <DashboardTopBar breadcrumbs={crumbs} />
            <main className='flex-1 overflow-y-auto overflow-x-hidden'>
              <div className='w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8'>
                <div className='mx-auto max-w-7xl space-y-6'>{children}</div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </>
  );
}
