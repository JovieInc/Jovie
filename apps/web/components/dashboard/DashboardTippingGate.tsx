'use client';

import dynamic from 'next/dynamic';

const DashboardTipping = dynamic(
  () =>
    import('@/components/dashboard/dashboard-tipping').then(mod => ({
      default: mod.DashboardTipping,
    })),
  {
    loading: () => (
      <div className='space-y-5'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-2'>
            <div className='h-8 w-32 animate-pulse rounded bg-surface-1' />
            <div className='h-4 w-64 animate-pulse rounded bg-surface-1' />
          </div>
        </div>
        <div className='h-48 animate-pulse rounded-xl bg-surface-1' />
        <div className='grid gap-5 lg:grid-cols-2'>
          <div className='h-64 animate-pulse rounded-xl bg-surface-1' />
          <div className='h-64 animate-pulse rounded-xl bg-surface-1' />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function DashboardTippingGate() {
  return <DashboardTipping />;
}
