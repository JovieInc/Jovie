const RELEASES_LOADING_ROW_KEYS = Array.from({ length: 3 }, (_, i) => i);

/**
 * Keep the releases loading surface extremely cheap.
 * This route's blocking budget is about perceived shell response, not a
 * perfectly mirrored table placeholder.
 */
export function ReleaseTableSkeleton() {
  return (
    <div
      className='flex h-full min-h-0 flex-col gap-3 px-3 py-3 lg:px-4'
      data-testid='releases-loading'
      aria-busy='true'
    >
      <div className='flex items-center justify-between rounded-[20px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-3'>
        <div className='space-y-2'>
          <div className='h-3 w-16 rounded-full bg-surface-2/80 animate-pulse' />
          <div className='h-6 w-40 rounded-full bg-surface-2/70 animate-pulse' />
        </div>
        <div className='h-9 w-24 rounded-full bg-surface-2/70 animate-pulse' />
      </div>

      <div className='overflow-hidden rounded-[22px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)'>
        <div className='grid grid-cols-[minmax(0,1.8fr)_110px_88px] gap-3 border-b border-(--linear-app-frame-seam) px-4 py-3 max-sm:hidden'>
          <div className='h-3 w-20 rounded-full bg-surface-2/70' />
          <div className='h-3 w-16 rounded-full bg-surface-2/70' />
          <div className='h-3 w-12 rounded-full bg-surface-2/70' />
        </div>

        <div className='divide-y divide-(--linear-app-frame-seam)'>
          {RELEASES_LOADING_ROW_KEYS.map(row => (
            <div
              key={`releases-row-${row}`}
              className='grid grid-cols-[minmax(0,1.8fr)_110px_88px] items-center gap-3 px-4 py-3 max-sm:grid-cols-1'
            >
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 shrink-0 rounded-[12px] bg-surface-2/70' />
                <div className='min-w-0 flex-1 space-y-2'>
                  <div className='h-4 w-3/5 rounded-full bg-surface-2/70' />
                  <div className='h-3 w-24 rounded-full bg-surface-2/60' />
                </div>
              </div>
              <div className='flex items-center gap-2 max-sm:hidden'>
                <div className='h-6 w-10 rounded-full bg-surface-2/60' />
                <div className='h-6 w-10 rounded-full bg-surface-2/60' />
              </div>
              <div className='ml-auto h-8 w-14 rounded-full bg-surface-2/70 max-sm:hidden' />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Default export for Next.js file-based loading state.
 * Automatically used as Suspense fallback during route navigation.
 */
export default function ReleasesLoading() {
  return <ReleaseTableSkeleton />;
}
