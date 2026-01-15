import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const RELEASES_LOADING_PROVIDER_HEADER_KEYS = Array.from(
  { length: 5 },
  (_, i) => `releases-provider-header-${i + 1}`
);
const RELEASES_LOADING_ROW_KEYS = Array.from(
  { length: 5 },
  (_, i) => `releases-row-${i + 1}`
);
const RELEASES_LOADING_PROVIDER_BADGE_KEYS = Array.from(
  { length: 4 },
  (_, i) => `releases-provider-badge-${i + 1}`
);

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
          {RELEASES_LOADING_PROVIDER_HEADER_KEYS.map(key => (
            <LoadingSkeleton key={key} height='h-8' width='w-20' rounded='lg' />
          ))}
        </div>

        {/* Release rows */}
        <div className='mt-4 space-y-3'>
          {RELEASES_LOADING_ROW_KEYS.map(rowKey => (
            <div
              key={rowKey}
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
                {RELEASES_LOADING_PROVIDER_BADGE_KEYS.map(badgeKey => (
                  <LoadingSkeleton
                    key={`${rowKey}-${badgeKey}`}
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
