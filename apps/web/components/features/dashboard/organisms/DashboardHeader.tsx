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
  const rootLabel =
    breadcrumbs.length > 1 ? (breadcrumbs[0]?.label ?? 'Jovie') : 'Jovie';
  const usesSectionTitleLayout = breadcrumbs.length === 1 && !breadcrumbSuffix;

  return (
    <header
      data-testid='dashboard-header'
      className={cn('z-20 bg-(--linear-app-content-surface)', className)}
    >
      {/* Mobile: Large page title with action buttons + profile */}
      <div className='hidden max-sm:flex items-center justify-between px-4 pb-2 pt-3'>
        <h1 className='text-[17px] font-semibold leading-tight tracking-[-0.018em] text-primary-token'>
          {currentLabel}
        </h1>
        <div className='flex items-center gap-2'>
          {action ? (
            <div className='flex items-center gap-1 [&_button]:h-8 [&_button]:rounded-full [&_button]:shadow-none [&_button>svg]:h-4 [&_button>svg]:w-4'>
              {action}
            </div>
          ) : (
            mobileProfileSlot
          )}
        </div>
      </div>
      {/* Desktop: Standard header bar with breadcrumbs */}
      <div className='relative max-sm:hidden h-(--linear-app-header-height-compact) w-full items-center gap-2 px-2.5 sm:flex'>
        {leading ? <div className='flex items-center'>{leading}</div> : null}
        {/* Sidebar expand button (desktop only, when collapsed) */}
        {sidebarTrigger ? (
          <div className='max-lg:hidden items-center lg:flex'>
            {sidebarTrigger}
          </div>
        ) : null}
        {/* Conditional vertical separator between sidebar trigger and actions */}
        {showDivider && sidebarTrigger && action ? (
          <div className='max-lg:hidden lg:flex items-center'>
            <VerticalDivider />
          </div>
        ) : null}
        {/* Desktop: Simplified breadcrumb - just current page */}
        <div className='flex min-w-0 flex-1 items-center gap-1 tracking-[-0.012em]'>
          {usesSectionTitleLayout ? (
            <span className='truncate text-xs font-semibold tracking-[-0.01em] text-primary-token'>
              {currentLabel}
            </span>
          ) : (
            <>
              <span className='shrink-0 text-2xs font-caption tracking-[-0.01em] text-tertiary-token'>
                {rootLabel}
              </span>
              <ChevronRight className='size-3 shrink-0 text-quaternary-token/85' />
              {breadcrumbSuffix ? (
                <div className='min-w-0 truncate text-xs tracking-[-0.01em] text-secondary-token'>
                  {breadcrumbSuffix}
                </div>
              ) : (
                <span className='truncate text-xs font-semibold tracking-[-0.01em] text-primary-token'>
                  {currentLabel}
                </span>
              )}
            </>
          )}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-1'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
