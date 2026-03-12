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

  return (
    <header
      data-testid='dashboard-header'
      className={cn(
        'z-20 border-b border-(--linear-border-subtle) bg-(--linear-app-content-surface) supports-[backdrop-filter]:backdrop-blur-md',
        className
      )}
    >
      {/* Mobile: Large page title with action buttons + profile */}
      <div className='flex items-center justify-between px-4 pt-4 pb-2.5 sm:hidden'>
        <h1 className='text-[22px] font-[590] tracking-[-0.022em] text-primary-token leading-tight'>
          {currentLabel}
        </h1>
        <div className='flex items-center gap-2'>
          {action ? (
            <div className='flex items-center gap-1.5 [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-[8px] [&>button]:border [&>button]:border-(--linear-border-subtle) [&>button]:bg-(--linear-bg-surface-0) [&>button>svg]:h-4 [&>button>svg]:w-4'>
              {action}
            </div>
          ) : (
            mobileProfileSlot
          )}
        </div>
      </div>
      {/* Desktop: Standard header bar with breadcrumbs */}
      <div className='relative hidden h-[var(--linear-app-header-height)] w-full items-center gap-1.5 px-[var(--linear-app-header-padding-x)] sm:flex'>
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
        <div className='flex min-w-0 flex-1 items-center gap-1.5 text-[12px] tracking-[-0.01em]'>
          <span className='shrink-0 text-(--linear-text-tertiary)'>
            {rootLabel}
          </span>
          <ChevronRight className='size-3.5 shrink-0 text-(--linear-text-quaternary)' />
          {breadcrumbSuffix ? (
            <div className='min-w-0 truncate text-(--linear-text-secondary)'>
              {breadcrumbSuffix}
            </div>
          ) : (
            <span className='truncate font-[510] text-primary-token'>
              {currentLabel}
            </span>
          )}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-[var(--linear-app-toolbar-gap)]'>
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
}
