import { Container } from '@/components/site/Container';

/**
 * Loading skeleton for individual blog post pages.
 */
export default function BlogPostLoading() {
  return (
    <article className='bg-white dark:bg-[#0D0E12] py-12 md:py-16'>
      <Container size='md'>
        <header className='mb-8 md:mb-12'>
          {/* Back link skeleton */}
          <div className='mb-6 h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
          {/* Title skeleton */}
          <div className='h-12 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
          <div className='mt-2 h-12 w-3/4 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
          {/* Meta (date, author) */}
          <div className='mt-6 flex items-center gap-4'>
            <div className='h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
            <div className='h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
          </div>
        </header>

        {/* Featured image placeholder */}
        <div className='mb-8 aspect-video w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800' />

        {/* Content skeleton - paragraphs */}
        <div className='space-y-6'>
          {Array.from({ length: 5 }, (_, i) => `paragraph-${i}`).map(key => (
            <div key={key} className='space-y-2'>
              <div className='h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
              <div className='h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
              <div className='h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
              <div className='h-4 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
            </div>
          ))}
        </div>
      </Container>
    </article>
  );
}
