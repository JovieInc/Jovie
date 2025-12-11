'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';

import { DashboardTopBar } from '@/components/dashboard/layout/DashboardTopBar';
import { SidebarInset, SidebarProvider } from '@/components/organisms/Sidebar';

import { AdminSidebar } from './AdminSidebar';

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    const parts = (pathname || '/admin').split('/').filter(Boolean);
    const adminIndex = parts.indexOf('admin');
    const segments = adminIndex >= 0 ? parts.slice(adminIndex + 1) : [];

    const toTitle = (value: string): string =>
      value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

    const items = [{ label: 'Admin', href: '/admin' }];

    if (segments.length > 0) {
      let acc = '/admin';
      segments.forEach((segment, index) => {
        acc += `/${segment}`;
        const isLast = index === segments.length - 1;
        items.push({ label: toTitle(segment), href: isLast ? acc : acc });
      });
    }

    return items;
  }, [pathname]);

  return (
    <SidebarProvider>
      <div className='flex h-svh w-full overflow-hidden bg-base text-primary-token'>
        <AdminSidebar />
        <SidebarInset className='flex flex-1 flex-col overflow-hidden'>
          <DashboardTopBar breadcrumbs={breadcrumbs} />
          <main className='min-h-0 flex-1 overflow-auto'>
            <div className='w-full px-0 py-6'>{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
