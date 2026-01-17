'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';

import { Copyright } from '@/components/atoms/Copyright';
import { DashboardThemeToggleButton } from '@/components/dashboard/atoms/DashboardThemeToggleButton';
import { DashboardHeader } from '@/components/dashboard/organisms/DashboardHeader';
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
      value
        .replaceAll('-', ' ')
        .replaceAll(/\b\w/g, char => char.toUpperCase());

    const items = [{ label: 'Admin', href: '/admin' }];

    if (segments.length > 0) {
      let acc = '/admin';
      segments.forEach((segment, index) => {
        acc += `/${segment}`;
        items.push({ label: toTitle(segment), href: acc });
      });
    }

    return items;
  }, [pathname]);

  return (
    <SidebarProvider>
      <div className='flex h-svh w-full overflow-hidden bg-base text-primary-token'>
        <AdminSidebar />
        <SidebarInset className='flex flex-1 flex-col overflow-hidden'>
          <DashboardHeader
            breadcrumbs={breadcrumbs}
            action={<DashboardThemeToggleButton />}
            className='bg-bg-base/75 backdrop-blur supports-backdrop-filter:bg-bg-base/65'
          />
          <main className='min-h-0 flex-1 overflow-auto'>
            <div className='h-full min-h-0 w-full px-4 py-6 pb-20 sm:px-6 lg:px-8'>
              {children}
            </div>
          </main>
          <footer className='sticky bottom-0 z-20 border-t border-subtle bg-bg-base/75 backdrop-blur supports-backdrop-filter:bg-bg-base/65'>
            <div className='flex h-12 w-full items-center gap-3 px-4 text-xs text-secondary-token sm:px-6 lg:px-8'>
              <Copyright variant='light' />
              <div className='ml-auto flex items-center gap-3'>
                <Link
                  href='/legal/privacy'
                  className='transition-colors hover:text-primary-token'
                >
                  Privacy
                </Link>
                <Link
                  href='/legal/terms'
                  className='transition-colors hover:text-primary-token'
                >
                  Terms
                </Link>
              </div>
            </div>
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
