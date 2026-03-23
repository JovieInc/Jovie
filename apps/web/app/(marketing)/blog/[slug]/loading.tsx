import { MarketingContainer } from '@/components/marketing';

/**
 * Loading skeleton for individual blog post pages.
 */
export default function BlogPostLoading() {
  return (
    <article className='py-16 sm:py-20 lg:py-24'>
      <MarketingContainer width='prose'>
        <header className='mb-8 md:mb-12'>
          {/* Back link skeleton */}
          <div className='mb-6 h-4 w-24 skeleton motion-reduce:animate-none rounded' />
          {/* Meta skeleton */}
          <div className='flex items-center gap-3 mb-6'>
            <div className='h-4 w-32 skeleton motion-reduce:animate-none rounded' />
            <div className='h-4 w-24 skeleton motion-reduce:animate-none rounded' />
          </div>
          {/* Title skeleton */}
          <div className='h-12 w-full skeleton motion-reduce:animate-none rounded-lg' />
          <div className='mt-2 h-12 w-3/4 skeleton motion-reduce:animate-none rounded-lg' />
          {/* Excerpt skeleton */}
          <div className='mt-6 h-5 w-full skeleton motion-reduce:animate-none rounded' />
          <div className='mt-2 h-5 w-4/5 skeleton motion-reduce:animate-none rounded' />
        </header>

        {/* Content skeleton - paragraphs */}
        <div className='space-y-6'>
          {Array.from({ length: 5 }, (_, i) => `paragraph-${i}`).map(key => (
            <div key={key} className='space-y-2'>
              <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
              <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
              <div className='h-4 w-5/6 skeleton motion-reduce:animate-none rounded' />
              <div className='h-4 w-4/5 skeleton motion-reduce:animate-none rounded' />
            </div>
          ))}
        </div>
      </MarketingContainer>
    </article>
  );
}
