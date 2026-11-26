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
      <Skeleton height='h-6' className='w-36' />
      <Skeleton height='h-4' className='mt-2 w-72 max-w-full' />

      <DialogBody className='space-y-4'>
        <Skeleton height='h-4' className='w-80 max-w-full' />

        <div className='px-3 py-3' data-testid='dialog-loading-search'>
          <div className='flex items-center gap-3'>
            <Skeleton height='h-6' className='w-6' rounded='full' />
            <Skeleton height='h-4' className='flex-1' />
            <Skeleton height='h-8' className='w-28' rounded='md' />
          </div>
        </div>

        <div className='p-2.5' data-testid='dialog-loading-results'>
          <div className='space-y-1.5'>
            {rowIds.map(rowId => (
              <div
                key={rowId}
                className='flex min-h-14 items-center gap-3 px-2.5'
              >
                <Skeleton
                  height='h-10'
                  className='w-10 shrink-0'
                  rounded='full'
                />
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <Skeleton height='h-3.5' className='w-32' />
                  <Skeleton height='h-2.5' className='w-20' />
                </div>
                <Skeleton
                  height='h-4'
                  className='w-4 shrink-0'
                  rounded='full'
                />
              </div>
            ))}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
