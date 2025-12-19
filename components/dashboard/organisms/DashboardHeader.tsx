import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface DashboardHeaderProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  leading?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  action,
  className,
}: DashboardHeaderProps) {
  const currentLabel =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : '';

  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-subtle bg-bg-base',
        className
      )}
    >
      <div className='relative flex h-12 w-full items-center gap-2 px-4 sm:px-6 lg:px-8'>
        {leading ? <div className='flex items-center'>{leading}</div> : null}
        <nav
          aria-label='Breadcrumb'
          className='hidden min-w-0 items-center gap-1 text-[13px] text-secondary-token sm:flex'
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
        <div className='absolute left-1/2 hidden min-w-0 -translate-x-1/2 text-[13px] font-medium text-primary-token sm:hidden'>
          <span className='block max-w-[180px] truncate'>{currentLabel}</span>
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
