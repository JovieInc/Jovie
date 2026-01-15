import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const LINKS_LOADING_CHIP_KEYS = Array.from(
  { length: 6 },
  (_, i) => `links-chip-${i + 1}`
);
const LINKS_LOADING_ROW_KEYS = Array.from(
  { length: 4 },
  (_, i) => `links-row-${i + 1}`
);

export default function LinksLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        <div className='space-y-2'>
          <LoadingSkeleton height='h-7' width='w-40' />
          <LoadingSkeleton height='h-4' width='w-72' />
        </div>

        <div className='mt-6 flex flex-wrap gap-2'>
          {LINKS_LOADING_CHIP_KEYS.map(key => (
            <LoadingSkeleton
              key={key}
              height='h-8'
              width='w-24'
              rounded='full'
              className='shrink-0'
            />
          ))}
        </div>

        <div className='mt-6 space-y-3'>
          {LINKS_LOADING_ROW_KEYS.map(key => (
            <div
              key={key}
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
