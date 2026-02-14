'use client';

import { LoadingSkeleton, Skeleton } from '@jovie/ui';

export function BillingLoadingSkeleton() {
  return (
    <div className='space-y-8'>
      <div className='space-y-3'>
        <Skeleton className='h-9 w-48' rounded='md' />
        <Skeleton className='h-5 w-80' rounded='sm' />
      </div>
      <Skeleton className='h-36 w-full' rounded='lg' />
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <Skeleton className='h-80 w-full' rounded='lg' />
        <Skeleton className='h-80 w-full' rounded='lg' />
        <Skeleton className='h-80 w-full' rounded='lg' />
      </div>
      <Skeleton className='h-20 w-full' rounded='lg' />
      <div className='space-y-3'>
        <Skeleton className='h-6 w-36' rounded='sm' />
        <LoadingSkeleton lines={3} height='h-14' rounded='md' />
      </div>
    </div>
  );
}
