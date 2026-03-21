import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const CARD_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

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
      <div className='flex-1 min-h-0 overflow-y-auto px-3.5 pb-3.5 pt-2.5 lg:px-4 lg:pb-4 lg:pt-3'>
        <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3'>
          {CARD_KEYS.map(key => (
            <div
              key={key}
              className='rounded-xl border border-subtle bg-(--linear-app-content-surface) p-3.5'
            >
              <div className='space-y-2.5'>
                <div className='flex items-start justify-between gap-2.5'>
                  <div className='flex items-center gap-2.5'>
                    <LoadingSkeleton
                      height='h-10'
                      width='w-10'
                      rounded='full'
                      className='shrink-0'
                    />
                    <div className='space-y-1'>
                      <LoadingSkeleton height='h-4' width='w-28' rounded='md' />
                      <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
                    </div>
                  </div>
                  <LoadingSkeleton height='h-5' width='w-16' rounded='full' />
                </div>
                <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
