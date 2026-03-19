'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { AdminCreatorFilters } from '@/features/admin/AdminCreatorFilters';

export interface AdminCreatorsFooterProps
  extends Readonly<{
    readonly page: number;
    readonly totalPages: number;
    readonly from: number;
    readonly to: number;
    readonly total: number;
    readonly pageSize: number;
    readonly canPrev: boolean;
    readonly canNext: boolean;
    readonly prevHref: string | null | undefined;
    readonly nextHref: string | null | undefined;
  }> {}

export function AdminCreatorsFooter({
  page,
  totalPages,
  from,
  to,
  total,
  pageSize,
  canPrev,
  canNext,
  prevHref,
  nextHref,
}: Readonly<AdminCreatorsFooterProps>) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-secondary-token'>
      <div className='flex items-center gap-2'>
        <span className='tabular-nums'>
          Page {page} of {totalPages}
        </span>
        <span className='tabular-nums text-tertiary-token'>
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()}
        </span>
      </div>
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-2'>
          <span>Rows per page</span>
          <AdminCreatorFilters initialPageSize={pageSize} />
        </div>
        <div className='flex items-center gap-2'>
          {prevHref ? (
            <Button asChild size='sm' variant='ghost'>
              <Link href={prevHref}>Previous</Link>
            </Button>
          ) : (
            <Button size='sm' variant='ghost' disabled>
              Previous
            </Button>
          )}
          {nextHref ? (
            <Button asChild size='sm' variant='ghost'>
              <Link href={nextHref}>Next</Link>
            </Button>
          ) : (
            <Button size='sm' variant='ghost' disabled>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
