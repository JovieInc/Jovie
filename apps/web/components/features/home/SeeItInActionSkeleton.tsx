import { Skeleton } from '@jovie/ui';

/**
 * Loading skeleton for the SeeItInAction section
 * Displays while featured creators are being fetched
 */
export function SeeItInActionSkeleton() {
  return (
    <section
      className='relative overflow-hidden bg-base py-16 sm:py-20'
      aria-busy='true'
      aria-label='Loading featured creators'
    >
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-2xl text-center'>
          <Skeleton className='mx-auto mb-4 h-10 w-3/4' rounded='lg' />
          <Skeleton className='mx-auto mb-12 h-6 w-2/3' rounded='lg' />
        </div>

        <div className='relative mx-auto max-w-6xl'>
          <div className='flex justify-center gap-4 overflow-hidden'>
            {Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map(key => (
              <Skeleton
                key={key}
                className='h-24 w-24 shrink-0 sm:h-32 sm:w-32'
                rounded='full'
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
