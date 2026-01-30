import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const EARNINGS_LOADING_STAT_KEYS = Array.from(
  { length: 3 },
  (_, i) => `earnings-stat-${i + 1}`
);
const EARNINGS_LOADING_TX_KEYS = Array.from(
  { length: 4 },
  (_, i) => `earnings-tx-${i + 1}`
);

export default function EarningsLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        {/* Header */}
        <div className='space-y-2'>
          <LoadingSkeleton height='h-7' width='w-32' />
          <LoadingSkeleton height='h-4' width='w-64' />
        </div>

        {/* Stats cards */}
        <div className='mt-6 grid gap-4 sm:grid-cols-3'>
          {EARNINGS_LOADING_STAT_KEYS.map(key => (
            <div
              key={key}
              className='rounded-lg border border-subtle bg-surface-0 p-4'
            >
              <LoadingSkeleton height='h-4' width='w-24' />
              <LoadingSkeleton height='h-8' width='w-32' className='mt-2' />
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div className='mt-6 rounded-lg border border-subtle bg-surface-0 p-4'>
          <LoadingSkeleton height='h-5' width='w-40' />
          <LoadingSkeleton height='h-48' width='w-full' className='mt-4' />
        </div>

        {/* Transactions list */}
        <div className='mt-6 space-y-3'>
          <LoadingSkeleton height='h-5' width='w-32' />
          {EARNINGS_LOADING_TX_KEYS.map(key => (
            <div
              key={key}
              className='flex items-center justify-between rounded-lg border border-subtle bg-surface-0 p-4'
            >
              <div className='space-y-1'>
                <LoadingSkeleton height='h-4' width='w-32' />
                <LoadingSkeleton height='h-3' width='w-24' />
              </div>
              <LoadingSkeleton height='h-5' width='w-16' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
