import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function LinksLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        <div className='space-y-2'>
          <LoadingSkeleton height='h-7' width='w-40' />
          <LoadingSkeleton height='h-4' width='w-72' />
        </div>

        <div className='mt-6 flex flex-wrap gap-2'>
          {Array.from({ length: 6 }).map((_, index) => (
            <LoadingSkeleton
              key={index}
              height='h-8'
              width='w-24'
              rounded='full'
              className='shrink-0'
            />
          ))}
        </div>

        <div className='mt-6 space-y-3'>
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3'
            >
              <LoadingSkeleton
                height='h-10'
                width='w-10'
                rounded='full'
                className='shrink-0'
              />
              <div className='flex-1 space-y-2'>
                <LoadingSkeleton height='h-4' width='w-2/3' />
                <LoadingSkeleton height='h-3' width='w-1/2' />
              </div>
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-9' width='w-14' />
                <LoadingSkeleton height='h-9' width='w-14' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
