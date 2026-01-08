import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';

export interface DashboardHeaderProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  leading?: ReactNode;
  sidebarTrigger?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  action,
  className,
}: DashboardHeaderProps) {
  const currentLabel =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : '';

  return (
    <header
      data-testid='dashboard-header'
      className={cn('sticky top-0 z-20 bg-[var(--color-bg-base)]', className)}
    >
      <div className='relative flex h-12 w-full items-center gap-2 px-4 sm:px-6 lg:px-8'>
        {leading ? <div className='flex items-center'>{leading}</div> : null}
        {/* Sidebar expand button (desktop only, when collapsed) */}
        {sidebarTrigger ? (
          <div className='hidden lg:flex items-center'>{sidebarTrigger}</div>
        ) : null}
        {/* Mobile: Show current page title centered */}
        <h1 className='flex-1 text-center text-[15px] font-semibold text-primary-token sm:hidden'>
          <span className='block max-w-[200px] truncate mx-auto'>
            {currentLabel}
          </span>
        </h1>
        {/* Desktop: Full breadcrumb navigation */}
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
                  <span
                    className='truncate text-[13px] font-medium text-primary-token'
                    aria-current={isLast ? 'page' : undefined}
                  >
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
