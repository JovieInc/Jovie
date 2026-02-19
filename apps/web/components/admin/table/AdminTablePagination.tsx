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

export interface AdminTablePaginationProps {
  /** Current page number (1-indexed) */
  readonly page: number;
  /** Total number of pages */
  readonly totalPages: number;
  /** First item index on current page */
  readonly from: number;
  /** Last item index on current page */
  readonly to: number;
  /** Total number of items */
  readonly total: number;
  /** Whether previous page is available */
  readonly canPrev: boolean;
  /** Whether next page is available */
  readonly canNext: boolean;
  /** URL for previous page */
  readonly prevHref?: string | null;
  /** URL for next page */
  readonly nextHref?: string | null;
  /** Current page size */
  readonly pageSize?: number;
  /** Callback when page size changes */
  readonly onPageSizeChange?: (pageSize: number) => void;
  /** Available page size options */
  readonly pageSizeOptions?: number[];
  /** Label for the entity being paginated (e.g., "users", "creators") */
  readonly entityLabel?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

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
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  entityLabel,
}: Readonly<AdminTablePaginationProps>) {
  const showPageSizeSelector = pageSize !== undefined && onPageSizeChange;

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-0 px-4 py-3 text-xs text-secondary-token'>
      {/* Page info */}
      <div className='flex items-center gap-2'>
        <span>
          <span className='hidden sm:inline'>Page </span>
          <span className='font-medium text-primary-token'>{page}</span>
          <span className='hidden sm:inline'> of</span>
          <span className='sm:hidden'> /</span> {totalPages}
        </span>
        <span className='hidden sm:inline text-tertiary-token'>
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()}
          {entityLabel ? ` ${entityLabel}` : ''}
        </span>
      </div>

      {/* Controls */}
      <div className='flex items-center gap-3'>
        {showPageSizeSelector && (
          <div className='hidden sm:flex items-center gap-2'>
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
          <Button
            asChild
            size='sm'
            variant='ghost'
            disabled={!canPrev}
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <Link
              href={prevHref ?? '#'}
              aria-disabled={!canPrev}
              aria-label='Previous page'
            >
              <ChevronLeft
                className='h-3.5 w-3.5 sm:hidden'
                aria-hidden='true'
              />
              <span className='hidden sm:inline'>Previous</span>
            </Link>
          </Button>
          <Button
            asChild
            size='sm'
            variant='ghost'
            disabled={!canNext}
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <Link
              href={nextHref ?? '#'}
              aria-disabled={!canNext}
              aria-label='Next page'
            >
              <ChevronRight
                className='h-3.5 w-3.5 sm:hidden'
                aria-hidden='true'
              />
              <span className='hidden sm:inline'>Next</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
