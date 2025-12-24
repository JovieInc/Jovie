'use client';

import dynamic from 'next/dynamic';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';

const DashboardTipping = dynamic(
  () =>
    import('@/components/dashboard/DashboardTipping').then(mod => ({
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
  const tippingGate = useFeatureGate(STATSIG_FLAGS.TIPPING);

  if (!tippingGate.value) {
    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Tipping is not available yet
          </h1>
          <p className='text-secondary-token'>
            We&apos;re focusing on getting the core Jovie profile experience
            right before launching tipping.
          </p>
        </div>
      </div>
    );
  }

  return <DashboardTipping />;
}
