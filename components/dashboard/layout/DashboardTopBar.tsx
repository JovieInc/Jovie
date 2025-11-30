import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <header className='sticky top-0 z-20 border-b border-subtle bg-surface-0 backdrop-blur supports-backdrop-filter:bg-surface-0'>
      <div className='mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8'>
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
                  <Link
                    href={crumb.href}
                    className='transition-colors hover:text-primary-token'
                  >
                    <span className='text-xs text-tertiary-token'>
                      {crumb.label}
                    </span>
                  </Link>
                ) : (
                  <span className='text-primary-token'>{crumb.label}</span>
                )}
                {!isLast && <span className='text-tertiary-token'>›</span>}
              </span>
            );
          })}
        </nav>
        {actions ? (
          <div className='ml-auto flex items-center gap-2'>{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
