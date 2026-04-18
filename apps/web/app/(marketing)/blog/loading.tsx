import { MarketingContainer } from '@/components/marketing';

/**
 * Loading skeleton for the blog index page.
 * Matches: hero → featured post card → 2-column grid of remaining posts.
 */
export default function BlogIndexLoading() {
  return (
    <div className='min-h-screen'>
      {/* Hero section */}
      <section className='relative overflow-hidden py-16 sm:py-20 lg:py-24'>
        <div className='mx-auto max-w-7xl px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-left'>
            <div className='h-4 w-12 skeleton motion-reduce:animate-none rounded mb-4' />
            <div className='h-12 w-24 skeleton motion-reduce:animate-none rounded-lg mt-6 mb-6' />
            <div className='h-5 w-80 max-w-full skeleton motion-reduce:animate-none rounded-lg' />
          </div>
        </div>
      </section>

      {/* Posts grid */}
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />

        {/* Featured post */}
        <div className='mb-10 space-y-4'>
          <div className='aspect-[2/1] w-full rounded-xl skeleton motion-reduce:animate-none' />
          <div className='space-y-2'>
            <div className='h-3 w-24 skeleton motion-reduce:animate-none rounded' />
            <div className='h-7 w-3/4 skeleton motion-reduce:animate-none rounded' />
            <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
            <div className='h-4 w-2/3 skeleton motion-reduce:animate-none rounded' />
          </div>
        </div>

        {/* Remaining posts 2-column grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
          {Array.from({ length: 4 }, (_, i) => `post-skeleton-${i}`).map(
            key => (
              <div key={key} className='space-y-4'>
                <div className='aspect-[2/1] w-full rounded-xl skeleton motion-reduce:animate-none' />
                <div className='space-y-2'>
                  <div className='h-3 w-20 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-6 w-4/5 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-3/4 skeleton motion-reduce:animate-none rounded' />
                </div>
              </div>
            )
          )}
        </div>
      </MarketingContainer>
    </div>
  );
}
