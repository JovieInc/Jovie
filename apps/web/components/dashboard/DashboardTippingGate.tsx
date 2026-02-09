'use client';

import dynamic from 'next/dynamic';

const DashboardTipping = dynamic(
  () =>
    import('@/components/dashboard/dashboard-tipping').then(mod => ({
      default: mod.DashboardTipping,
    })),
  {
    loading: () => (
      <div className='flex flex-col gap-6 pb-6'>
        {/* Header */}
        <div className='space-y-1'>
          <div className='h-6 w-28 animate-pulse rounded-md bg-surface-1' />
          <div className='h-4 w-56 animate-pulse rounded-md bg-surface-1' />
        </div>

        {/* Section label */}
        <div className='h-3 w-16 animate-pulse rounded-sm bg-surface-1' />

        {/* Stat cards */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className='space-y-2 rounded-xl border border-subtle bg-surface-1 p-4'
            >
              <div className='flex items-center gap-2'>
                <div className='h-7 w-7 animate-pulse rounded-lg bg-surface-0' />
                <div className='h-3 w-16 animate-pulse rounded-sm bg-surface-0' />
              </div>
              <div className='h-7 w-20 animate-pulse rounded-md bg-surface-0' />
              <div className='h-3 w-28 animate-pulse rounded-sm bg-surface-0' />
            </div>
          ))}
        </div>

        {/* Share section label */}
        <div className='h-3 w-12 animate-pulse rounded-sm bg-surface-1' />

        {/* Share cards */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='h-40 animate-pulse rounded-xl border border-subtle bg-surface-1' />
          <div className='h-64 animate-pulse rounded-xl border border-subtle bg-surface-1' />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardTippingGate() {
  return <DashboardTipping />;
}
