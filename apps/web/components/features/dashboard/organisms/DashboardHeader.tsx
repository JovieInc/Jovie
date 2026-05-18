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
  /**
   * Shell-owned search surface. When set, the closed trigger renders inline
   * beside the breadcrumb; when `isSearchActive` is true, the breadcrumb
   * collapses and the search takes over the leading area to avoid layout shift.
   */
  readonly searchSurface?: ReactNode;
  readonly isSearchActive?: boolean;
  /** Profile button slot shown on the far right of the mobile header */
  readonly mobileProfileSlot?: ReactNode;
  readonly showDivider?: boolean;
  readonly className?: string;
}

const MOBILE_HEADER_PADDING = 'px-4 pb-2 pt-3';

function MobileHeader({
  currentLabel,
  action,
  searchSurface,
  isSearchActive,
  mobileProfileSlot,
}: {
  readonly currentLabel: string;
  readonly action?: ReactNode;
  readonly searchSurface?: ReactNode;
  readonly isSearchActive: boolean;
  readonly mobileProfileSlot?: ReactNode;
}) {
  if (searchSurface && isSearchActive) {
    return (
      <div className={cn('hidden max-sm:flex', MOBILE_HEADER_PADDING)}>
        {searchSurface}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'hidden max-sm:flex items-center justify-between',
        MOBILE_HEADER_PADDING
      )}
    >
      <h1 className='text-[17px] font-semibold leading-tight tracking-[-0.018em] text-primary-token'>
        {currentLabel}
      </h1>
      <div className='flex items-center gap-2'>
        {searchSurface ? (
          <div className='flex items-center'>{searchSurface}</div>
        ) : null}
        {action ? (
          <div className='flex items-center gap-1 [&_button]:h-8 [&_button]:rounded-full [&_button]:shadow-none [&_button>svg]:h-4 [&_button>svg]:w-4'>
            {action}
          </div>
        ) : searchSurface ? null : (
          mobileProfileSlot
        )}
      </div>
    </div>
  );
}

function BreadcrumbTrail({
  usesSectionTitleLayout,
  currentLabel,
  rootLabel,
  breadcrumbSuffix,
  showInlineSearch,
  searchSurface,
}: {
  readonly usesSectionTitleLayout: boolean;
  readonly currentLabel: string;
  readonly rootLabel: string;
  readonly breadcrumbSuffix?: ReactNode;
  readonly showInlineSearch: boolean;
  readonly searchSurface?: ReactNode;
}) {
  return (
    <>
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
      {showInlineSearch ? (
        <div className='ml-1.5 flex min-w-0 items-center'>{searchSurface}</div>
      ) : null}
    </>
  );
}

export function DashboardHeader({
  breadcrumbs,
  leading,
  sidebarTrigger,
  breadcrumbSuffix,
  action,
  searchSurface,
  isSearchActive = false,
  mobileProfileSlot,
  showDivider = false,
  className,
}: DashboardHeaderProps) {
  const currentLabel = breadcrumbs.at(-1)?.label ?? '';
  const rootLabel =
    breadcrumbs.length > 1 ? (breadcrumbs[0]?.label ?? 'Jovie') : 'Jovie';
  const usesSectionTitleLayout = breadcrumbs.length === 1 && !breadcrumbSuffix;
  const showInlineSearch = Boolean(searchSurface);
  const searchTakesOver = showInlineSearch && isSearchActive;

  return (
    <header
      data-testid='dashboard-header'
      data-electron-drag-region='true'
      className={cn('z-20 bg-(--linear-app-content-surface)', className)}
    >
      <MobileHeader
        currentLabel={currentLabel}
        action={action}
        searchSurface={searchSurface}
        isSearchActive={searchTakesOver}
        mobileProfileSlot={mobileProfileSlot}
      />
      <div className='relative max-sm:hidden h-(--linear-app-header-height-compact) w-full items-center gap-2 px-2.5 sm:flex'>
        {leading ? <div className='flex items-center'>{leading}</div> : null}
        {sidebarTrigger ? (
          <div className='max-lg:hidden items-center lg:flex'>
            {sidebarTrigger}
          </div>
        ) : null}
        {showDivider && sidebarTrigger && action ? (
          <div className='max-lg:hidden lg:flex items-center'>
            <VerticalDivider />
          </div>
        ) : null}
        <div
          className='flex min-w-0 flex-1 items-center gap-2 tracking-[-0.012em]'
          data-search-active={searchTakesOver ? 'true' : 'false'}
        >
          {searchTakesOver ? (
            <div className='min-w-0 flex-1 flex items-center'>
              {searchSurface}
            </div>
          ) : (
            <BreadcrumbTrail
              usesSectionTitleLayout={usesSectionTitleLayout}
              currentLabel={currentLabel}
              rootLabel={rootLabel}
              breadcrumbSuffix={breadcrumbSuffix}
              showInlineSearch={showInlineSearch}
              searchSurface={searchSurface}
            />
          )}
        </div>
        {action ? (
          <div className='ml-auto flex items-center gap-1'>{action}</div>
        ) : null}
      </div>
    </header>
  );
}
