import { Container } from '@/components/site/Container';

/**
 * Loading skeleton for the blog index page.
 */
export default function BlogIndexLoading() {
  return (
    <section className='bg-white dark:bg-[#0D0E12] py-12 md:py-16'>
      <Container>
        <header className='mb-8 md:mb-12'>
          {/* Title skeleton */}
          <div className='h-10 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
          {/* Subtitle skeleton */}
          <div className='mt-2 h-5 w-64 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
        </header>

        {/* Blog post cards grid */}
        <div className='grid gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {Array.from({ length: 6 }, (_, i) => `blog-card-${i}`).map(key => (
            <article
              key={key}
              className='rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden'
            >
              {/* Image placeholder */}
              <div className='aspect-video w-full animate-pulse bg-gray-200 dark:bg-gray-800' />
              <div className='p-6 space-y-3'>
                {/* Title */}
                <div className='h-6 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
                {/* Excerpt lines */}
                <div className='h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
                <div className='h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
                {/* Date */}
                <div className='h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
