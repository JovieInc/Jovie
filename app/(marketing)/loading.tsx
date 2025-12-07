/**
 * Marketing pages loading skeleton
 * Renders the hero area shell to prevent layout shift while JS hydrates.
 */
export default function MarketingLoading() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0D0E12]'>
      {/* Hero skeleton */}
      <section className='relative flex min-h-[80vh] flex-col items-center justify-center px-4 py-20 text-center'>
        {/* Headline placeholder */}
        <div className='h-12 w-3/4 max-w-xl rounded skeleton mb-4' />
        {/* Subheadline placeholder */}
        <div className='h-6 w-2/3 max-w-md rounded skeleton mb-8' />
        {/* CTA input + button placeholder */}
        <div className='flex w-full max-w-sm gap-2'>
          <div className='h-12 flex-1 rounded-lg skeleton' />
          <div className='h-12 w-28 rounded-lg skeleton' />
        </div>
      </section>
    </div>
  );
}
