'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminPageSizeSelect } from '../AdminPageSizeSelect';

export interface TablePaginationFooterProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
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
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-3 bg-surface-0 border-t border-subtle',
        className
      )}
    >
      {/* Items info */}
      <div className='flex items-center gap-4'>
        <span className='text-sm text-secondary-token'>
          Showing {startItem} to {endItem} of {totalItems}
        </span>

        {/* Page size selector */}
        <AdminPageSizeSelect
          initialPageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
      </div>

      {/* Pagination controls */}
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          aria-label='Previous page'
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>

        <span className='text-sm text-primary-token px-2'>
          Page {currentPage} of {totalPages}
        </span>

        <Button
          variant='ghost'
          size='sm'
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          aria-label='Next page'
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
