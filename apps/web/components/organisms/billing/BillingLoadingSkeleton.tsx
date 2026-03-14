'use client';

import { LoadingSkeleton, Skeleton } from '@jovie/ui';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const PLAN_CARD_SKELETONS = [
  { key: 'free', titleWidth: 'w-24', descriptionWidth: 'w-36' },
  { key: 'pro', titleWidth: 'w-24', descriptionWidth: 'w-36' },
  { key: 'growth', titleWidth: 'w-24', descriptionWidth: 'w-36' },
] as const;

export function BillingLoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='space-y-3'>
        <Skeleton className='h-9 w-48' rounded='md' />
        <Skeleton className='h-5 w-80' rounded='sm' />
      </div>

      <ContentSurfaceCard className='p-4'>
        <div className='flex items-start gap-3.5'>
          <Skeleton className='h-11 w-11 shrink-0 rounded-[12px]' />
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className='h-5 w-32' rounded='md' />
            <Skeleton className='h-4 w-72' rounded='sm' />
          </div>
          <Skeleton className='h-8 w-32 rounded-[8px]' rounded='md' />
        </div>
      </ContentSurfaceCard>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {PLAN_CARD_SKELETONS.map(card => (
          <ContentSurfaceCard key={card.key} className='overflow-hidden p-0'>
            <ContentSectionHeaderSkeleton
              titleWidth={card.titleWidth}
              descriptionWidth={card.descriptionWidth}
              className='px-4 py-3'
            />
            <div className='space-y-4 px-4 py-4'>
              <Skeleton className='h-9 w-24' rounded='md' />
              <Skeleton className='h-8 w-full rounded-[8px]' rounded='md' />
              <div className='h-px bg-(--linear-app-frame-seam)' />
              <LoadingSkeleton lines={5} height='h-4' rounded='md' />
            </div>
          </ContentSurfaceCard>
        ))}
      </div>

      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-36'
          descriptionWidth='w-56'
          className='px-4 py-3'
        />
        <div className='flex flex-col gap-3 px-4 py-4 sm:flex-row'>
          <Skeleton className='h-8 w-40 rounded-[8px]' rounded='md' />
          <Skeleton className='h-8 w-40 rounded-[8px]' rounded='md' />
        </div>
      </ContentSurfaceCard>

      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-32'
          descriptionWidth='w-52'
          className='px-4 py-3'
        />
        <div className='px-4 py-4'>
          <LoadingSkeleton lines={3} height='h-14' rounded='md' />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
