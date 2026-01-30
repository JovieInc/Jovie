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
    <div className='flex h-full min-h-0 flex-col'>
      {/* Header */}
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div className='space-y-2'>
            <LoadingSkeleton height='h-6' width='w-32' rounded='md' />
            <LoadingSkeleton height='h-4' width='w-64' rounded='md' />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className='flex-1 min-h-0 overflow-auto'>
        <div className='px-4 py-6 sm:px-6'>
          {/* Stats cards */}
          <div className='grid gap-4 sm:grid-cols-3'>
            {EARNINGS_LOADING_STAT_KEYS.map(key => (
              <div
                key={key}
                className='rounded-lg border border-subtle bg-surface-1 p-4 shadow-sm'
              >
                <LoadingSkeleton height='h-4' width='w-24' rounded='md' />
                <LoadingSkeleton
                  height='h-8'
                  width='w-32'
                  rounded='md'
                  className='mt-2'
                />
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div className='mt-6 rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
            <LoadingSkeleton height='h-5' width='w-40' rounded='md' />
            <LoadingSkeleton
              height='h-48'
              width='w-full'
              rounded='lg'
              className='mt-4'
            />
          </div>

          {/* Transactions list */}
          <div className='mt-6 space-y-3'>
            <LoadingSkeleton height='h-5' width='w-32' rounded='md' />
            {EARNINGS_LOADING_TX_KEYS.map(key => (
              <div
                key={key}
                className='flex items-center justify-between rounded-lg border border-subtle bg-surface-1 p-4 shadow-sm'
              >
                <div className='space-y-1'>
                  <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                  <LoadingSkeleton height='h-3' width='w-24' rounded='md' />
                </div>
                <LoadingSkeleton height='h-5' width='w-16' rounded='md' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
