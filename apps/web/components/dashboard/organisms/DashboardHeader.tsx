import { ChevronRight } from 'lucide-react';
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
  /** Profile button slot shown on the far right of the mobile header */
  readonly mobileProfileSlot?: ReactNode;
  readonly showDivider?: boolean;
  readonly className?: string;
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  breadcrumbSuffix,
  action,
  mobileProfileSlot,
  showDivider = false,
  className,
}: DashboardHeaderProps) {
  const currentLabel = breadcrumbs.at(-1)?.label ?? '';

  return (
    <header data-testid='dashboard-header' className={cn('z-20', className)}>
      {/* Mobile: Large page title with action buttons + profile */}
      <div className='flex items-center justify-between px-3 pt-3 pb-2 sm:hidden gap-2'>
        <h1 className='text-xl font-bold tracking-[-0.02em] text-primary-token leading-tight min-w-0 truncate'>
          {currentLabel}
        </h1>
        <div className='flex items-center gap-2'>
          {action ? (
            <div className='flex items-center gap-1.5 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-lg [&>button]:bg-surface-2 [&>button]:border-0 [&>button>svg]:h-4 [&>button>svg]:w-4'>
              {action}
            </div>
          ) : (
            mobileProfileSlot
          )}
        </div>
      </div>
      {/* Desktop: Standard header bar with breadcrumbs */}
      <div className='relative hidden h-12 w-full items-center gap-2 px-5 md:px-6 sm:flex'>
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
        <div className='flex-1 items-center flex text-[13px]'>
          {!breadcrumbSuffix && (
            <>
              <span className='text-tertiary-token'>Jovie</span>
              <ChevronRight className='size-3.5 text-quaternary-token mx-0.5' />
              <span className='font-medium text-primary-token'>
                {currentLabel}
              </span>
            </>
          )}
          {breadcrumbSuffix}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-2'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
