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
      className={cn(
        'z-20 border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)/95 supports-[backdrop-filter]:backdrop-blur-md',
        className
      )}
    >
      {/* Mobile: Large page title with action buttons + profile */}
      <div className='flex items-center justify-between px-4 pt-3 pb-2 sm:hidden'>
        <h1 className='text-[20px] font-[570] tracking-[-0.018em] text-primary-token leading-tight'>
          {currentLabel}
        </h1>
        <div className='flex items-center gap-2'>
          {action ? (
            <div className='flex items-center gap-1.5 [&_button]:h-8 [&_button]:rounded-full [&_button]:border [&_button]:border-subtle [&_button]:bg-surface-0 [&_button>svg]:h-4 [&_button>svg]:w-4'>
              {action}
            </div>
          ) : (
            mobileProfileSlot
          )}
        </div>
      </div>
      {/* Desktop: Standard header bar with breadcrumbs */}
      <div className='relative hidden h-(--linear-app-header-height) w-full items-center gap-1 px-(--linear-app-header-padding-x) sm:flex'>
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
        <div className='flex min-w-0 flex-1 items-center gap-1 tracking-[-0.01em]'>
          {usesSectionTitleLayout ? (
            <span className='truncate text-[13px] font-[510] tracking-[-0.01em] text-primary-token'>
              {currentLabel}
            </span>
          ) : (
            <>
              <span className='shrink-0 text-[12px] text-tertiary-token'>
                {rootLabel}
              </span>
              <ChevronRight className='size-3 shrink-0 text-quaternary-token' />
              {breadcrumbSuffix ? (
                <div className='min-w-0 truncate text-[12px] text-secondary-token'>
                  {breadcrumbSuffix}
                </div>
              ) : (
                <span className='truncate text-[12px] font-[510] text-primary-token'>
                  {currentLabel}
                </span>
              )}
            </>
          )}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-(--linear-app-toolbar-gap)'>
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
}
