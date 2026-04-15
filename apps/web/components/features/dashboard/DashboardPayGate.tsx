'use client';

import dynamic from 'next/dynamic';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const STAT_CARD_KEYS = ['qr', 'link', 'total'] as const;

const DashboardPay = dynamic(
  () =>
    import('@/features/dashboard/dashboard-pay').then(mod => ({
      default: mod.DashboardPay,
    })),
  {
    loading: () => (
      <div className='flex flex-col gap-6 pb-6'>
        {/* Header */}
        <div className='space-y-1'>
          <LoadingSkeleton height='h-6' width='w-28' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-56' rounded='md' />
        </div>

        {/* Section label */}
        <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />

        {/* Stat cards */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          {STAT_CARD_KEYS.map(key => (
            <ContentSurfaceCard key={key} className='space-y-2 p-4'>
              <div className='flex items-center gap-2'>
                <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
                <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
              </div>
              <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
              <LoadingSkeleton height='h-3' width='w-28' rounded='sm' />
            </ContentSurfaceCard>
          ))}
        </div>

        {/* Share section label */}
        <LoadingSkeleton height='h-3' width='w-12' rounded='sm' />

        {/* Share cards */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <ContentSurfaceCard className='p-4 sm:p-5'>
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
                <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
              </div>
              <LoadingSkeleton height='h-10' width='w-full' rounded='lg' />
              <LoadingSkeleton height='h-3' width='w-48' rounded='sm' />
            </div>
          </ContentSurfaceCard>
          <ContentSurfaceCard className='p-4 sm:p-5'>
            <div className='space-y-4'>
              <div className='flex items-center gap-2'>
                <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
                <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
              </div>
              <LoadingSkeleton
                height='h-40'
                width='w-40'
                rounded='lg'
                className='mx-auto'
              />
              <LoadingSkeleton
                height='h-8'
                width='w-28'
                rounded='md'
                className='mx-auto'
              />
            </div>
          </ContentSurfaceCard>
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardPayGate() {
  return <DashboardPay />;
}
