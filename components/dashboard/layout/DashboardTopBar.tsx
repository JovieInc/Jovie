import Link from 'next/link';
import type { ReactNode } from 'react';

import { SidebarTrigger } from '@/components/organisms/Sidebar';

export interface DashboardBreadcrumbItem {
  label: string;
  href?: string;
}

interface DashboardTopBarProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  actions?: ReactNode;
}

export function DashboardTopBar({
  breadcrumbs,
  actions,
}: DashboardTopBarProps) {
  return (
    <header className='sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-sidebar/60'>
      <SidebarTrigger className='-ml-1' />
      <div className='h-4 w-px bg-sidebar-border' />
      <nav
        aria-label='Breadcrumb'
        className='flex items-center gap-1 text-sm text-muted-foreground'
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span
              key={`${crumb.label}-${index}`}
              className='flex items-center gap-1'
            >
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className='transition-colors hover:text-foreground'
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className='text-foreground'>{crumb.label}</span>
              )}
              {!isLast && <span className='text-muted-foreground/50'>/</span>}
            </span>
          );
        })}
      </nav>
      {actions ? (
        <div className='ml-auto flex items-center gap-2'>{actions}</div>
      ) : null}
    </header>
  );
}
