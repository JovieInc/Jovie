import Link from 'next/link';
import type { ReactNode } from 'react';

import { SidebarTrigger } from '@/components/ui/Sidebar';

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
    <header className='flex h-14 shrink-0 items-center gap-3 border-b border-subtle bg-base px-4 transition-[height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12'>
      <SidebarTrigger className='-ml-1' />
      <nav
        aria-label='Breadcrumb'
        className='flex items-center gap-1 text-sm text-secondary-token'
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span
              key={`${crumb.label}-${index}`}
              className='flex items-center gap-1'
            >
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className='hover:underline'>
                  {crumb.label}
                </Link>
              ) : (
                <span className='text-primary-token'>{crumb.label}</span>
              )}
              {!isLast && <span className='text-tertiary-token'>/</span>}
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
