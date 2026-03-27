import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const ROW_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

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

      {/* Table skeleton */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        {/* Header row */}
        <div className='flex items-center gap-4 border-b border-subtle px-3 py-2'>
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-12' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-10' rounded='sm' />
          <div className='ml-auto flex w-[48px] justify-end'>
            <LoadingSkeleton height='h-3' width='w-4' rounded='sm' />
          </div>
        </div>

        {/* Data rows */}
        {ROW_KEYS.map(key => (
          <div
            key={key}
            className='flex items-center gap-4 border-b border-subtle px-3 py-2'
          >
            <div className='flex items-center gap-2 w-[200px]'>
              <LoadingSkeleton
                height='h-6'
                width='w-6'
                rounded='full'
                className='shrink-0'
              />
              <LoadingSkeleton height='h-3.5' width='w-24' rounded='sm' />
            </div>
            <div className='flex items-center gap-1.5 w-[140px]'>
              <LoadingSkeleton
                height='h-4'
                width='w-4'
                rounded='sm'
                className='shrink-0'
              />
              <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
            </div>
            <div className='w-[120px]'>
              <LoadingSkeleton height='h-5' width='w-16' rounded='full' />
            </div>
            <div className='w-[100px]'>
              <LoadingSkeleton height='h-5' width='w-12' rounded='full' />
            </div>
            <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
            <div className='ml-auto flex w-[48px] justify-end'>
              <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
