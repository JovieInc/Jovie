import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { VerticalDivider } from '../atoms/VerticalDivider';

export interface DashboardHeaderProps {
  breadcrumbs: DashboardBreadcrumbItem[];
  leading?: ReactNode;
  sidebarTrigger?: ReactNode;
  action?: ReactNode;
  showDivider?: boolean;
  className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  action,
  showDivider = false,
  className,
}: DashboardHeaderProps) {
  const currentLabel =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : '';

  return (
    <header
      data-testid='dashboard-header'
      className={cn('z-20 border-b border-subtle', className)}
    >
      <div className='relative flex h-12 w-full items-center gap-2 px-4 sm:px-6 lg:px-8'>
        {leading ? <div className='flex items-center'>{leading}</div> : null}
        {/* Sidebar expand button (desktop only, when collapsed) */}
        {sidebarTrigger ? (
          <div className='hidden lg:flex items-center'>{sidebarTrigger}</div>
        ) : null}
        {/* Conditional vertical separator between sidebar trigger and actions */}
        {showDivider && sidebarTrigger && action ? (
          <div className='hidden lg:flex items-center'>
            <VerticalDivider />
          </div>
        ) : null}
        {/* Mobile: Show current page title centered */}
        <h1 className='flex-1 text-center text-[15px] font-semibold text-primary-token sm:hidden'>
          <span className='block max-w-[200px] truncate mx-auto'>
            {currentLabel}
          </span>
        </h1>
        {/* Desktop: Simplified breadcrumb - just current page */}
        <div className='hidden flex-1 items-center gap-2 sm:flex'>
          <span className='text-[13px] font-medium text-primary-token'>
            {currentLabel}
          </span>
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
