'use client';

import { Button } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface WaitlistTablePaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly prevHref?: string;
  readonly nextHref?: string;
}

export function WaitlistTablePagination({
  page,
  totalPages,
  canPrev,
  canNext,
  prevHref,
  nextHref,
}: WaitlistTablePaginationProps) {
  return (
    <div className='flex items-center justify-between gap-2 border-t border-subtle px-4 py-3 text-xs text-secondary-token'>
      <div className='flex items-center gap-1'>
        <span className='hidden sm:inline'>Page </span>
        <span className='font-medium text-primary-token'>{page}</span>
        <span> / {totalPages}</span>
      </div>
      <div className='flex items-center gap-1 sm:gap-2'>
        {prevHref ? (
          <Button
            asChild
            size='sm'
            variant='ghost'
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <Link href={prevHref} aria-label='Previous page'>
              <ChevronLeft className='h-3.5 w-3.5 sm:hidden' />
              <span className='hidden sm:inline'>Previous</span>
            </Link>
          </Button>
        ) : (
          <Button
            size='sm'
            variant='ghost'
            disabled
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
            aria-label='Previous page'
          >
            <ChevronLeft className='h-3.5 w-3.5 sm:hidden' />
            <span className='hidden sm:inline'>Previous</span>
          </Button>
        )}
        {nextHref ? (
          <Button
            asChild
            size='sm'
            variant='ghost'
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
          >
            <Link href={nextHref} aria-label='Next page'>
              <ChevronRight className='h-3.5 w-3.5 sm:hidden' />
              <span className='hidden sm:inline'>Next</span>
            </Link>
          </Button>
        ) : (
          <Button
            size='sm'
            variant='ghost'
            disabled
            className='h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3 sm:py-1.5'
            aria-label='Next page'
          >
            <ChevronRight className='h-3.5 w-3.5 sm:hidden' />
            <span className='hidden sm:inline'>Next</span>
          </Button>
        )}
      </div>
    </div>
  );
}
