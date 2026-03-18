'use client';

import { DrawerSurfaceCard } from '@/components/molecules/drawer';
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
      <div className='h-6 w-36 rounded skeleton' />
      <div className='mt-2 h-4 w-72 max-w-full rounded skeleton' />

      <DialogBody className='space-y-4'>
        <div className='h-4 w-80 max-w-full rounded skeleton' />

        <div className='rounded-xl border border-subtle bg-surface-0 px-4 py-3'>
          <div className='flex items-center gap-3'>
            <div className='h-6 w-6 rounded-full skeleton' />
            <div className='h-4 flex-1 rounded skeleton' />
            <div className='h-8 w-28 rounded-md skeleton' />
          </div>
        </div>

        <div className='rounded-xl border border-default bg-surface-0 p-3 shadow-(--linear-shadow-card-elevated)'>
          <div className='space-y-1.5'>
            {rowIds.map(rowId => (
              <DrawerSurfaceCard
                key={rowId}
                variant='card'
                className='flex min-h-[64px] items-center gap-3 rounded-[10px] px-3'
              >
                <div className='h-10 w-10 shrink-0 rounded-full skeleton' />
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <div className='h-3.5 w-32 rounded skeleton' />
                  <div className='h-2.5 w-20 rounded skeleton' />
                </div>
                <div className='h-4 w-4 shrink-0 rounded-full skeleton' />
              </DrawerSurfaceCard>
            ))}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
