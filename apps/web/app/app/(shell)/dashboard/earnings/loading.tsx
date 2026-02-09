import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const STAT_KEYS = ['stat-1', 'stat-2', 'stat-3'] as const;

export default function EarningsLoading() {
  return (
    <div className='flex flex-col gap-6 pb-6'>
      {/* Header */}
      <div className='space-y-1'>
        <LoadingSkeleton height='h-6' width='w-28' rounded='md' />
        <LoadingSkeleton height='h-4' width='w-56' rounded='md' />
      </div>

      {/* Section label */}
      <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />

      {/* Stat cards — 2 cols mobile, 3 cols sm+ */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
        {STAT_KEYS.map(key => (
          <div
            key={key}
            className='space-y-2 rounded-xl border border-subtle bg-surface-1 p-4'
          >
            <div className='flex items-center gap-2'>
              <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
              <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
            </div>
            <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
            <LoadingSkeleton height='h-3' width='w-28' rounded='sm' />
          </div>
        ))}
      </div>

      {/* Share section label */}
      <LoadingSkeleton height='h-3' width='w-12' rounded='sm' />

      {/* Sharing tools — stacked mobile, 2 cols sm+ */}
      <div className='grid gap-4 sm:grid-cols-2'>
        {/* Tip link card */}
        <div className='space-y-3 rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
          <div className='flex items-center gap-2'>
            <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
            <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
          </div>
          <div className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2.5'>
            <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
            <LoadingSkeleton height='h-7' width='w-14' rounded='md' />
          </div>
          <LoadingSkeleton height='h-3' width='w-48' rounded='sm' />
        </div>

        {/* QR code card */}
        <div className='space-y-4 rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
          <div className='flex items-center gap-2'>
            <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
            <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
          </div>
          <div className='flex flex-col items-center gap-4'>
            <div className='w-full rounded-xl bg-surface-0 p-4 sm:p-6'>
              <LoadingSkeleton
                height='h-40'
                width='w-40'
                rounded='lg'
                className='mx-auto'
              />
            </div>
            <LoadingSkeleton height='h-8' width='w-28' rounded='md' />
          </div>
        </div>
      </div>
    </div>
  );
}
