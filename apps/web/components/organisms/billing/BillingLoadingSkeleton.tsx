'use client';

import { LoadingSkeleton, Skeleton } from '@jovie/ui';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';

const PLAN_CARD_SKELETONS = [
  { key: 'free', titleWidth: 'w-24', descriptionWidth: 'w-36' },
  { key: 'pro', titleWidth: 'w-24', descriptionWidth: 'w-36' },
  { key: 'max', titleWidth: 'w-24', descriptionWidth: 'w-36' },
] as const;

export function BillingLoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <Skeleton height='h-9' className='w-48' rounded='md' />
        <Skeleton height='h-5' className='w-80' rounded='sm' />
      </div>

      <div className='px-3 py-3'>
        <div className='flex items-start gap-3.5'>
          <Skeleton height='h-11' className='w-11 shrink-0' rounded='lg' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton height='h-5' className='w-32' rounded='md' />
            <Skeleton height='h-4' className='w-72' rounded='sm' />
          </div>
          <Skeleton height='h-8' className='w-32' rounded='md' />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {PLAN_CARD_SKELETONS.map(card => (
          <div key={card.key} className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth={card.titleWidth}
              descriptionWidth={card.descriptionWidth}
              className='px-4 py-3'
            />
            <div className='space-y-3 px-3 py-3'>
              <Skeleton height='h-9' className='w-24' rounded='md' />
              <Skeleton height='h-8' className='w-full' rounded='md' />
              <div className='h-px bg-(--app-shell-frame-seam)' />
              <LoadingSkeleton lines={5} height='h-4' rounded='md' />
            </div>
          </div>
        ))}
      </div>

      <div className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-36'
          descriptionWidth='w-56'
          className='px-4 py-3'
        />
        <div className='flex flex-col gap-3 px-3 py-3 sm:flex-row'>
          <Skeleton height='h-8' className='w-40' rounded='md' />
          <Skeleton height='h-8' className='w-40' rounded='md' />
        </div>
      </div>

      <div className='overflow-hidden'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-32'
          descriptionWidth='w-52'
          className='px-4 py-3'
        />
        <div className='px-3 py-3'>
          <LoadingSkeleton lines={3} height='h-14' rounded='md' />
        </div>
      </div>
    </div>
  );
}
