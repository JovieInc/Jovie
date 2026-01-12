import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function ReleasesLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <LoadingSkeleton height='h-7' width='w-32' />
            <LoadingSkeleton height='h-4' width='w-56' />
          </div>
          <LoadingSkeleton height='h-10' width='w-40' rounded='lg' />
        </div>

        {/* Provider columns header */}
        <div className='mt-6 flex gap-2'>
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton
              key={index}
              height='h-8'
              width='w-20'
              rounded='lg'
            />
          ))}
        </div>

        {/* Release rows */}
        <div className='mt-4 space-y-3'>
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className='flex items-center gap-4 rounded-lg border border-subtle bg-surface-0 p-4'
            >
              {/* Album artwork */}
              <LoadingSkeleton
                height='h-14'
                width='w-14'
                rounded='lg'
                className='shrink-0'
              />
              {/* Release info */}
              <div className='min-w-0 flex-1 space-y-1'>
                <LoadingSkeleton height='h-4' width='w-48' />
                <LoadingSkeleton height='h-3' width='w-24' />
              </div>
              {/* Provider status badges */}
              <div className='flex gap-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <LoadingSkeleton
                    key={i}
                    height='h-8'
                    width='w-8'
                    rounded='lg'
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
