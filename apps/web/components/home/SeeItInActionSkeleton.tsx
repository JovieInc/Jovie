/**
 * Loading skeleton for the SeeItInAction section
 * Displays while featured creators are being fetched
 */
export function SeeItInActionSkeleton() {
  return (
    <section className='relative overflow-hidden bg-base py-16 sm:py-20'>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-2xl text-center'>
          {/* Title skeleton */}
          <div className='mb-4 h-10 w-3/4 mx-auto animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />

          {/* Subtitle skeleton */}
          <div className='mb-12 h-6 w-2/3 mx-auto animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
        </div>

        {/* Carousel skeleton */}
        <div className='relative mx-auto max-w-6xl'>
          <div className='flex gap-4 justify-center overflow-hidden'>
            {Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map(key => (
              <div
                key={key}
                className='h-24 w-24 sm:h-32 sm:w-32 flex-shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800'
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
