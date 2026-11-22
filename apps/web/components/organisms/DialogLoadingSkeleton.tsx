'use client';

import { Skeleton } from '@jovie/ui';
import { Dialog, DialogBody } from '@/components/organisms/Dialog';

export interface DialogLoadingSkeletonProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly rows?: number;
}

export function DialogLoadingSkeleton({
  open,
  onClose,
  size = 'lg',
  rows = 3,
}: DialogLoadingSkeletonProps) {
  const rowIds = Array.from(
    { length: rows },
    (_, index) => `dialog-loading-row-${index + 1}`
  );

  return (
    <Dialog open={open} onClose={onClose} size={size}>
      <Skeleton className='h-6 w-36' />
      <Skeleton className='mt-2 h-4 w-72 max-w-full' />

      <DialogBody className='space-y-4'>
        <Skeleton className='h-4 w-80 max-w-full' />

        <div className='px-3 py-3' data-testid='dialog-loading-search'>
          <div className='flex items-center gap-3'>
            <Skeleton className='h-6 w-6' rounded='full' />
            <Skeleton className='h-4 flex-1' />
            <Skeleton className='h-8 w-28' rounded='md' />
          </div>
        </div>

        <div className='p-2.5' data-testid='dialog-loading-results'>
          <div className='space-y-1.5'>
            {rowIds.map(rowId => (
              <div
                key={rowId}
                className='flex min-h-14 items-center gap-3 px-2.5'
              >
                <Skeleton className='h-10 w-10 shrink-0' rounded='full' />
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <Skeleton className='h-3.5 w-32' />
                  <Skeleton className='h-2.5 w-20' />
                </div>
                <Skeleton className='h-4 w-4 shrink-0' rounded='full' />
              </div>
            ))}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
