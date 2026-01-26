export default function TourLoading() {
  return (
    <div className='min-h-screen bg-surface-0'>
      {/* Header skeleton */}
      <header className='sticky top-0 z-10 border-b border-subtle bg-surface-1'>
        <div className='mx-auto max-w-2xl px-4 py-4'>
          <div className='h-5 w-32 animate-pulse rounded bg-surface-2' />
        </div>
      </header>

      {/* Content skeleton */}
      <main className='mx-auto max-w-2xl px-4 py-8'>
        <div className='mb-8'>
          <div className='h-8 w-64 animate-pulse rounded bg-surface-2' />
          <div className='mt-2 h-5 w-24 animate-pulse rounded bg-surface-2' />
        </div>

        <div className='space-y-4'>
          {Array.from({ length: 3 }, (_, i) => `tour-skeleton-${i}`).map(
            key => (
              <div
                key={key}
                className='rounded-xl border border-subtle bg-surface-1 p-4'
              >
                <div className='flex items-start gap-4'>
                  <div className='h-20 w-16 animate-pulse rounded-lg bg-surface-2' />
                  <div className='flex-1 space-y-2'>
                    <div className='h-5 w-48 animate-pulse rounded bg-surface-2' />
                    <div className='h-4 w-32 animate-pulse rounded bg-surface-2' />
                    <div className='mt-3 flex gap-2'>
                      <div className='h-8 w-24 animate-pulse rounded-lg bg-surface-2' />
                      <div className='h-8 w-32 animate-pulse rounded-lg bg-surface-2' />
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
