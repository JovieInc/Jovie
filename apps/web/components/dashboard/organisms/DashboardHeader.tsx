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
  readonly mobileTabs?: ReactNode;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  breadcrumbSuffix,
  action,
  showDivider = false,
  className,
  mobileTabs,
}: DashboardHeaderProps) {
  const currentLabel = breadcrumbs.at(-1)?.label ?? '';

  return (
    <header
      data-testid='dashboard-header'
      className={cn('z-20 border-b border-subtle', className)}
    >
      <div className='relative flex h-[52px] w-full items-center gap-2 px-4'>
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
        <h1 className='flex-1 text-center text-[15px] font-semibold text-secondary-token sm:hidden'>
          <span className='block max-w-[200px] truncate mx-auto'>
            {currentLabel}
          </span>
        </h1>
        {/* Desktop: Simplified breadcrumb - just current page */}
        <div className='hidden flex-1 items-center gap-3 sm:flex'>
          <span className='text-[13px] font-medium text-secondary-token'>
            {currentLabel}
          </span>
          {breadcrumbSuffix}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
      {/* Mobile tabs - rendered in header area as per user decision */}
      {mobileTabs && (
        <div className='lg:hidden border-t border-subtle'>{mobileTabs}</div>
      )}
    </header>
  );
}
