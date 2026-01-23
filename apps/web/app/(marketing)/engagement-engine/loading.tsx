/**
 * Engagement engine page loading skeleton
 */
export default function EngagementEngineLoading() {
  return (
    <div className='min-h-screen bg-white dark:bg-[#0D0E12]'>
      <section className='relative flex min-h-[80vh] flex-col items-center justify-center px-4 py-20 text-center'>
        {/* Title skeleton */}
        <div className='h-12 w-80 skeleton rounded-lg mb-4' />
        {/* Subtitle skeleton */}
        <div className='h-6 w-96 max-w-full skeleton rounded-md mb-8' />
        {/* CTA skeleton */}
        <div className='h-12 w-40 skeleton rounded-lg' />
      </section>

      {/* Features grid skeleton */}
      <section className='py-24 px-4'>
        <div className='mx-auto max-w-7xl'>
          <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-8'>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={`engagement-feature-${i + 1}`}
                className='p-6 rounded-xl border border-gray-200 dark:border-white/10'
              >
                <div className='h-10 w-10 skeleton rounded-lg mb-4' />
                <div className='h-6 w-40 skeleton rounded-md mb-2' />
                <div className='h-4 w-full skeleton rounded-md' />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
