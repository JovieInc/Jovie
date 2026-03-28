import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const CARD_KEYS = ['a', 'b', 'c'] as const;

export default function PresenceLoading() {
  return (
    <div
      className='flex h-full min-h-0 flex-col bg-[color-mix(in_oklab,var(--linear-bg-page)_72%,var(--linear-bg-surface-1))]'
      aria-busy='true'
    >
      {/* Summary bar skeleton */}
      <div className='shrink-0 border-b border-(--linear-app-frame-seam) px-3 py-2.5 lg:px-4'>
        <div className='flex items-center gap-3'>
          <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
          <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
        </div>
      </div>

      {/* Card grid skeleton */}
      <div className='flex-1 min-h-0 overflow-hidden p-4'>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {CARD_KEYS.map(key => (
            <div
              key={key}
              className='rounded-[10px] border border-subtle bg-surface-1/50 p-3 animate-pulse'
            >
              <div className='flex items-center gap-2'>
                <LoadingSkeleton
                  height='h-6'
                  width='w-6'
                  rounded='full'
                  className='shrink-0'
                />
                <LoadingSkeleton height='h-4' width='w-32' rounded='sm' />
              </div>
              <div className='flex items-center gap-1.5 mt-2'>
                <LoadingSkeleton
                  height='h-3'
                  width='w-3'
                  rounded='sm'
                  className='shrink-0'
                />
                <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
