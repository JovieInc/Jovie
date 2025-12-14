import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface DashboardHeaderProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  action?: ReactNode;
  className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  action,
  className,
}: DashboardHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-subtle bg-bg-base',
        className
      )}
    >
      <div className='flex h-12 w-full items-center gap-2 px-4 sm:px-6 lg:px-8'>
        <nav
          aria-label='Breadcrumb'
          className='flex min-w-0 items-center gap-1 text-[13px] text-secondary-token'
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span
                key={`${crumb.label}-${index}`}
                className='flex min-w-0 items-center gap-1'
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className='truncate text-secondary-token/80 transition-colors hover:text-primary-token dark:text-tertiary-token/80'
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className='truncate text-[13px] font-medium text-primary-token'>
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <span className='shrink-0 text-secondary-token/50 dark:text-tertiary-token/70'>
                    ›
                  </span>
                )}
              </span>
            );
          })}
        </nav>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
