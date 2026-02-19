'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminPageSizeSelect } from '../AdminPageSizeSelect';

export interface TablePaginationFooterProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
  readonly className?: string;
}

export function TablePaginationFooter({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  className,
}: TablePaginationFooterProps) {
  if (totalItems === 0) {
    return (
      <div
        className={cn(
          'flex items-center px-4 py-3 bg-surface-0 border-t border-subtle',
          className
        )}
      >
        <span className='text-xs text-secondary-token'>0 results</span>
      </div>
    );
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 bg-surface-0 border-t border-subtle text-xs text-secondary-token',
        className
      )}
    >
      {/* Page info */}
      <div className='flex items-center gap-2'>
        <span className='tabular-nums'>
          <span className='hidden sm:inline'>Page </span>
          <span className='font-medium text-primary-token'>{currentPage}</span>
          <span className='hidden sm:inline'> of</span>
          <span className='sm:hidden'> /</span> {totalPages}
        </span>
        <span className='hidden sm:inline text-tertiary-token tabular-nums'>
          {startItem.toLocaleString()}–{endItem.toLocaleString()} of{' '}
          {totalItems.toLocaleString()}
        </span>
      </div>

      {/* Controls */}
      <div className='flex items-center gap-3'>
        <div className='hidden sm:block'>
          <AdminPageSizeSelect
            initialPageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
        <div className='flex items-center gap-1 sm:gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canGoPrevious}
            aria-label='Previous page'
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <ChevronLeft className='h-3.5 w-3.5 sm:hidden' aria-hidden='true' />
            <span className='hidden sm:inline'>Previous</span>
          </Button>

          <Button
            variant='ghost'
            size='sm'
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canGoNext}
            aria-label='Next page'
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <ChevronRight
              className='h-3.5 w-3.5 sm:hidden'
              aria-hidden='true'
            />
            <span className='hidden sm:inline'>Next</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
