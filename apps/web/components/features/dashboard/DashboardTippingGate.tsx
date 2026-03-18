'use client';

import dynamic from 'next/dynamic';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const DashboardTipping = dynamic(
  () =>
    import('@/features/dashboard/dashboard-tipping').then(mod => ({
      default: mod.DashboardTipping,
    })),
  {
    loading: () => (
      <div className='flex flex-col gap-6 pb-6'>
        {/* Header */}
        <div className='space-y-1'>
          <div className='h-6 w-28 rounded-md skeleton' />
          <div className='h-4 w-56 rounded-md skeleton' />
        </div>

        {/* Section label */}
        <div className='h-3 w-16 rounded-sm skeleton' />

        {/* Stat cards */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          {[1, 2, 3].map(i => (
            <ContentSurfaceCard key={i} className='space-y-2 p-4'>
              <div className='flex items-center gap-2'>
                <div className='h-7 w-7 rounded-lg skeleton' />
                <div className='h-3 w-16 rounded-sm skeleton' />
              </div>
              <div className='h-7 w-20 rounded-md skeleton' />
              <div className='h-3 w-28 rounded-sm skeleton' />
            </ContentSurfaceCard>
          ))}
        </div>

        {/* Share section label */}
        <div className='h-3 w-12 rounded-sm skeleton' />

        {/* Share cards */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <ContentSurfaceCard className='h-40 skeleton motion-reduce:animate-none' />
          <ContentSurfaceCard className='h-64 skeleton motion-reduce:animate-none' />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardTippingGate() {
  return <DashboardTipping />;
}
