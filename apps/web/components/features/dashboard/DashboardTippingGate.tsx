'use client';

import dynamic from 'next/dynamic';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const STAT_CARD_KEYS = ['qr', 'link', 'total'] as const;

const DashboardTipping = dynamic(
  () =>
    import('@/features/dashboard/dashboard-tipping').then(mod => ({
      default: mod.DashboardTipping,
    })),
  {
    loading: () => (
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        {/* Tab bar skeleton */}
        <div className='shrink-0 border-b border-subtle px-3 py-2 sm:px-4'>
          <div className='flex gap-1'>
            <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
            <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
          </div>
        </div>

        <div className='flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4'>
          <ContentSurfaceCard className='shrink-0 p-3'>
            <div className='flex items-center gap-2 rounded-lg border border-subtle px-3 py-2'>
              <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
              <LoadingSkeleton height='h-7' width='w-14' rounded='md' />
            </div>
          </ContentSurfaceCard>

          <div className='grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.95fr)]'>
            <ContentSurfaceCard className='p-3'>
              <LoadingSkeleton height='h-4' width='w-36' rounded='sm' />
              <LoadingSkeleton
                height='h-3'
                width='w-44'
                rounded='sm'
                className='mt-1'
              />
              <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3'>
                {[...STAT_CARD_KEYS, 'stat-4', 'stat-5', 'stat-6'].map(key => (
                  <ContentSurfaceCard key={key} className='space-y-2 p-2.5'>
                    <div className='flex items-center gap-2'>
                      <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
                      <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
                    </div>
                    <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
                    <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
                  </ContentSurfaceCard>
                ))}
              </div>
            </ContentSurfaceCard>

            <ContentSurfaceCard className='p-3'>
              <LoadingSkeleton height='h-4' width='w-24' rounded='sm' />
              <LoadingSkeleton
                height='h-3'
                width='w-36'
                rounded='sm'
                className='mt-1'
              />
              <div className='mt-3 flex flex-col gap-3'>
                <div className='mx-auto'>
                  <LoadingSkeleton
                    height='h-[132px]'
                    width='w-[132px]'
                    rounded='lg'
                  />
                </div>
                <div className='space-y-2'>
                  <LoadingSkeleton height='h-9' width='w-full' rounded='md' />
                  <div className='grid gap-2 sm:grid-cols-3 xl:grid-cols-2'>
                    <LoadingSkeleton height='h-8' width='w-full' rounded='md' />
                    <LoadingSkeleton height='h-8' width='w-full' rounded='md' />
                    <LoadingSkeleton height='h-8' width='w-full' rounded='md' />
                  </div>
                </div>
              </div>
            </ContentSurfaceCard>
          </div>
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardTippingGate() {
  return <DashboardTipping />;
}
