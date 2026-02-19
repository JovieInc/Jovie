import { Container } from '@/components/site/Container';

/**
 * Loading skeleton for the changelog page.
 * Displayed while markdown is being processed.
 */
export default function ChangelogLoading() {
  return (
    <section className='bg-white text-gray-900 dark:bg-[#0D0E12] dark:text-white py-12 md:py-16'>
      <Container>
        <header className='mb-8 md:mb-10'>
          {/* Title skeleton */}
          <div className='h-10 w-48 skeleton motion-reduce:animate-none rounded-lg' />
          {/* Subtitle skeleton */}
          <div className='mt-2 h-5 w-96 max-w-full skeleton motion-reduce:animate-none rounded-lg' />
        </header>

        {/* Content skeleton - multiple version sections */}
        <div className='space-y-8'>
          {Array.from({ length: 3 }, (_, i) => `changelog-section-${i}`).map(
            key => (
              <div key={key} className='space-y-4'>
                {/* Version header */}
                <div className='h-8 w-32 skeleton motion-reduce:animate-none rounded-lg' />
                {/* Date */}
                <div className='h-4 w-24 skeleton motion-reduce:animate-none rounded-lg' />
                {/* Content lines */}
                <div className='space-y-2'>
                  <div className='h-4 w-full skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-5/6 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-4/6 skeleton motion-reduce:animate-none rounded' />
                  <div className='h-4 w-3/4 skeleton motion-reduce:animate-none rounded' />
                </div>
              </div>
            )
          )}
        </div>
      </Container>
    </section>
  );
}
