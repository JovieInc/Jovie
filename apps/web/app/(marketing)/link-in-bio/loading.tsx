/**
 * Link-in-bio page loading skeleton
 * Matches the hero and benefits grid layout
 */
export default function LinkInBioLoading() {
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

      {/* Benefits grid skeleton */}
      <section className='py-24 border-t border-gray-200 dark:border-white/5'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='grid md:grid-cols-3 gap-8'>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={`benefit-skeleton-${i + 1}`} className='space-y-4'>
                <div className='h-8 w-8 skeleton rounded-md' />
                <div className='h-6 w-32 skeleton rounded-md' />
                <div className='h-4 w-full skeleton rounded-md' />
                <div className='h-4 w-3/4 skeleton rounded-md' />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
