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
  /** Shell-owned search surface with a persistent header slot. */
  readonly searchSurface?: ReactNode;
  /**
   * Main-plane command/search takes over the breadcrumb seam while active.
   * This deliberately changes the existing header rather than layering a
   * second search control over route content.
   */
  readonly commandPaletteHeader?: ReactNode;
  readonly isSearchActive?: boolean;
  /** Profile button slot shown on the far right of the mobile header */
  readonly mobileProfileSlot?: ReactNode;
  readonly showDivider?: boolean;
  /**
   * Renders the header without its opaque surface fill so a shell-level
   * ambient wash can bleed through (chat routes, #13386). Height, layout,
   * and content are unchanged — only the background fill differs.
   */
  readonly transparent?: boolean;
  readonly className?: string;
}

const MOBILE_HEADER_PADDING = 'px-4 pb-2 pt-3';

function HeaderTitle({
  usesSectionTitleLayout,
  currentLabel,
  rootLabel,
  breadcrumbSuffix,
}: {
  readonly usesSectionTitleLayout: boolean;
  readonly currentLabel: string;
  readonly rootLabel: string;
  readonly breadcrumbSuffix?: ReactNode;
}) {
  return (
    <>
      {usesSectionTitleLayout ? null : (
        <>
          <span className='max-sm:hidden shrink-0 text-2xs font-caption tracking-tight text-tertiary-token'>
            {rootLabel}
          </span>
          <ChevronRight className='max-sm:hidden size-3 shrink-0 text-quaternary-token/85' />
        </>
      )}
      <h1
        className={cn(
          'min-w-0 truncate font-semibold text-primary-token',
          'text-base leading-tight tracking-[-0.018em]',
          'sm:text-xs sm:leading-normal sm:tracking-tight'
        )}
      >
        {breadcrumbSuffix ?? currentLabel}
      </h1>
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
  commandPaletteHeader,
  isSearchActive = false,
  mobileProfileSlot,
  showDivider = false,
  transparent = false,
  className,
}: DashboardHeaderProps) {
  const currentLabel = breadcrumbs.at(-1)?.label ?? '';
  const rootLabel =
    breadcrumbs.length > 1 ? (breadcrumbs[0]?.label ?? 'Jovie') : 'Jovie';
  const usesSectionTitleLayout = breadcrumbs.length === 1 && !breadcrumbSuffix;
  const showInlineSearch = Boolean(searchSurface);

  return (
    <header
      data-testid='dashboard-header'
      className={cn(
        'z-20',
        transparent ? 'bg-transparent' : 'bg-(--linear-app-content-surface)',
        className
      )}
    >
      {/* Keep responsive chrome in one DOM owner. Breakpoint classes change
          presentation without duplicating headings, search, or actions in the
          accessibility tree. */}
      <div
        className={cn(
          'relative flex w-full items-center gap-2',
          MOBILE_HEADER_PADDING,
          'sm:h-(--linear-app-header-height-compact) sm:px-3 sm:py-0'
        )}
      >
        {leading ? (
          <div className='max-sm:hidden flex items-center'>{leading}</div>
        ) : null}
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
          data-search-active={isSearchActive ? 'true' : 'false'}
        >
          {commandPaletteHeader ? (
            <div
              className='flex h-full min-w-0 flex-1 items-center'
              data-testid='dashboard-command-palette-header'
            >
              {commandPaletteHeader}
            </div>
          ) : (
            <HeaderTitle
              usesSectionTitleLayout={usesSectionTitleLayout}
              currentLabel={currentLabel}
              rootLabel={rootLabel}
              breadcrumbSuffix={breadcrumbSuffix}
            />
          )}
          {showInlineSearch ? (
            <div className='ml-auto flex min-w-0 shrink-0 items-center justify-start max-sm:w-app-control-sm sm:ml-1.5'>
              {searchSurface}
            </div>
          ) : null}
        </div>
        {action ? (
          <div
            className={cn(
              'ml-auto flex items-center gap-1',
              'max-sm:[&_button]:h-8 max-sm:[&_button]:rounded-full max-sm:[&_button]:shadow-none max-sm:[&_button>svg]:h-4 max-sm:[&_button>svg]:w-4'
            )}
          >
            {action}
          </div>
        ) : searchSurface ? null : (
          <div className='flex items-center gap-2 sm:hidden'>
            {mobileProfileSlot}
          </div>
        )}
      </div>
    </header>
  );
}
