import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardBreadcrumbItem } from '@/types/dashboard';
import { VerticalDivider } from '../atoms/VerticalDivider';

export interface DashboardHeaderProps {
  readonly breadcrumbs: DashboardBreadcrumbItem[];
  readonly leading?: ReactNode;
  readonly sidebarTrigger?: ReactNode;
  /** Content shown after breadcrumb (left side) */
  readonly breadcrumbSuffix?: ReactNode;
  /** Content shown on right side */
  readonly action?: ReactNode;
  readonly showDivider?: boolean;
  readonly className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  breadcrumbSuffix,
  action,
  showDivider = false,
  className,
}: DashboardHeaderProps) {
  const currentLabel = breadcrumbs.at(-1)?.label ?? '';

  return (
    <header
      data-testid='dashboard-header'
      className={cn('z-20 border-b border-subtle', className)}
    >
      {/* Mobile: Linear-style large page title with actions */}
      <div className='flex items-center justify-between px-4 pt-3 pb-2 sm:hidden'>
        <h1 className='text-[22px] font-bold tracking-tight text-primary-token'>
          {currentLabel}
        </h1>
        {action ? (
          <div className='flex items-center gap-2 [&>button]:h-10 [&>button]:w-10 [&>button]:rounded-full [&>button]:bg-surface-2 [&>button]:border-0 [&>button>svg]:h-4 [&>button>svg]:w-4'>
            {action}
          </div>
        ) : null}
      </div>
      {/* Desktop: Standard header bar with breadcrumbs */}
      <div className='relative hidden h-[52px] w-full items-center gap-2 px-4 sm:flex'>
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
        {/* Desktop: Simplified breadcrumb - just current page */}
        <div className='flex-1 items-center gap-3 flex'>
          <span className='text-[13px] font-medium text-secondary-token'>
            {currentLabel}
          </span>
          {breadcrumbSuffix}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
