'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

type PaginationDirection = 'previous' | 'next';

export interface AdminTablePaginationProps {
  /** Current page number (1-indexed) */
  readonly page: number;
  /** Total number of pages */
  readonly totalPages: number;
  /** First item index on current page */
  readonly from?: number;
  /** Last item index on current page */
  readonly to?: number;
  /** Total number of items */
  readonly total?: number;
  /** Whether previous page is available */
  readonly canPrev: boolean;
  /** Whether next page is available */
  readonly canNext: boolean;
  /** URL for previous page */
  readonly prevHref?: string | null;
  /** URL for next page */
  readonly nextHref?: string | null;
  /** Optional click handler for previous page when pagination is client-side */
  readonly onPrevClick?: () => void;
  /** Optional click handler for next page when pagination is client-side */
  readonly onNextClick?: () => void;
  /** Current page size */
  readonly pageSize?: number;
  /** Callback when page size changes */
  readonly onPageSizeChange?: (pageSize: number) => void;
  /** Available page size options */
  readonly pageSizeOptions?: number[];
  /** Label for the entity being paginated (e.g., "users", "creators") */
  readonly entityLabel?: string;
  /** Whether to show the item range after the page count */
  readonly showRange?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];
export const ADMIN_TABLE_PAGINATION_ROOT_CLASSNAME =
  'flex min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-t border-subtle px-(--app-shell-header-padding-x) py-2.5 text-xs text-secondary-token scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-8 min-w-8 rounded-full px-2.5 text-xs font-medium sm:px-3'
);

function PaginationNavButton({
  direction,
  canNavigate,
  href,
  onClick,
}: Readonly<{
  direction: PaginationDirection;
  canNavigate: boolean;
  href?: string | null;
  onClick?: () => void;
}>) {
  const label = direction === 'previous' ? 'Previous' : 'Next';
  const ariaLabel = direction === 'previous' ? 'Previous Page' : 'Next Page';
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  const content = (
    <>
      <Icon className='h-3.5 w-3.5 sm:hidden' aria-hidden='true' />
      <span className='max-sm:hidden sm:inline'>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <Button
        type='button'
        size='sm'
        variant='ghost'
        disabled={!canNavigate}
        onClick={onClick}
        className={ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME}
        aria-label={ariaLabel}
      >
        {content}
      </Button>
    );
  }

  if (canNavigate && href) {
    return (
      <Button
        asChild
        size='sm'
        variant='ghost'
        className={ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME}
      >
        <Link href={href} aria-label={ariaLabel}>
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size='sm'
      variant='ghost'
      disabled
      className={ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME}
      aria-label={ariaLabel}
    >
      {content}
    </Button>
  );
}

/**
 * Unified pagination component for admin tables.
 * Provides consistent pagination UI across all admin pages.
 */
export function AdminTablePagination({
  page,
  totalPages,
  from,
  to,
  total,
  canPrev,
  canNext,
  prevHref,
  nextHref,
  onPrevClick,
  onNextClick,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  entityLabel,
  showRange = true,
}: Readonly<AdminTablePaginationProps>) {
  const showPageSizeSelector = pageSize !== undefined && onPageSizeChange;
  const hasRange =
    showRange && from !== undefined && to !== undefined && total !== undefined;

  return (
    <div className={ADMIN_TABLE_PAGINATION_ROOT_CLASSNAME}>
      {/* Page info */}
      <div className='flex shrink-0 items-center gap-2'>
        <span
          className='tabular-nums'
          data-testid='admin-pagination-page-count'
        >
          <span className='max-sm:hidden sm:inline'>Page </span>
          <span className='font-semibold text-primary-token'>{page}</span>
          <span className='max-sm:hidden sm:inline'> of</span>
          <span className='sm:hidden'> /</span> {totalPages}
        </span>
        {hasRange ? (
          <span
            className='max-sm:hidden tabular-nums text-tertiary-token sm:inline'
            data-testid='admin-pagination-range'
          >
            {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()}
            {entityLabel ? ` ${entityLabel}` : ''}
          </span>
        ) : null}
      </div>

      {/* Controls */}
      <div className='ml-auto flex shrink-0 items-center gap-3'>
        {showPageSizeSelector && (
          <div className='max-sm:hidden items-center gap-2 sm:flex'>
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={value => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className='h-8 w-16 px-2 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map(size => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className='flex items-center gap-1 sm:gap-2'>
          <PaginationNavButton
            direction='previous'
            canNavigate={canPrev}
            href={prevHref}
            onClick={onPrevClick}
          />
          <PaginationNavButton
            direction='next'
            canNavigate={canNext}
            href={nextHref}
            onClick={onNextClick}
          />
        </div>
      </div>
    </div>
  );
}
