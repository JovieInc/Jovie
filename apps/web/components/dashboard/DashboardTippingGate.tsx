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
          <div className='h-6 w-28 rounded-md skeleton' />
          <div className='h-4 w-56 rounded-md skeleton' />
        </div>

        {/* Section label */}
        <div className='h-3 w-16 rounded-sm skeleton' />

        {/* Stat cards */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className='space-y-2 rounded-xl border border-subtle bg-surface-1 p-4'
            >
              <div className='flex items-center gap-2'>
                <div className='h-7 w-7 rounded-lg skeleton' />
                <div className='h-3 w-16 rounded-sm skeleton' />
              </div>
              <div className='h-7 w-20 rounded-md skeleton' />
              <div className='h-3 w-28 rounded-sm skeleton' />
            </div>
          ))}
        </div>

        {/* Share section label */}
        <div className='h-3 w-12 rounded-sm skeleton' />

        {/* Share cards */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='h-40 rounded-xl border border-subtle skeleton' />
          <div className='h-64 rounded-xl border border-subtle skeleton' />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardTippingGate() {
  return <DashboardTipping />;
}
