import { MarketingContainer } from '@/components/marketing';

/**
 * Loading skeleton for the blog index page.
 */
export default function BlogIndexLoading() {
  return (
    <section className='py-16 sm:py-20 lg:py-24'>
      <MarketingContainer width='page'>
        <header className='mb-12 md:mb-16 text-center'>
          {/* Eyebrow skeleton */}
          <div className='mx-auto h-4 w-20 skeleton motion-reduce:animate-none rounded mb-4' />
          {/* Title skeleton */}
          <div className='mx-auto h-12 w-32 skeleton motion-reduce:animate-none rounded-lg' />
          {/* Subtitle skeleton */}
          <div className='mx-auto mt-4 h-5 w-80 max-w-full skeleton motion-reduce:animate-none rounded-lg' />
        </header>

        {/* Timeline skeleton */}
        <div className='mx-auto max-w-3xl space-y-8'>
          {Array.from({ length: 5 }, (_, i) => `blog-skeleton-${i}`).map(
            key => (
              <div key={key} className='flex gap-6'>
                <div className='flex-shrink-0'>
                  <div className='w-[15px] h-[15px] rounded-full skeleton motion-reduce:animate-none' />
                </div>
                <div className='flex-1 space-y-3'>
                  <div className='h-3 w-28 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-6 w-4/5 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-3/4 skeleton motion-reduce:animate-none rounded' />
                </div>
              </div>
            )
          )}
        </div>
      </MarketingContainer>
    </section>
  );
}
