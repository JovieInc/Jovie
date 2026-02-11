export function ProblemStatement() {
  return (
    <section className='relative py-24 sm:py-32'>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-4xl text-center'>
          <div className='mb-8'>
            <div className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-sm font-medium text-red-400'>
              <svg
                className='w-4 h-4'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
                />
              </svg>
              The Problem
            </div>
          </div>

          <h2 className='text-4xl font-medium tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl'>
            Musicians lose fans to bad profile experiences
          </h2>

          <div className='mt-12 space-y-8 text-lg leading-relaxed text-gray-600 dark:text-white/70'>
            <p className='text-xl'>
              73% of fans abandon music discovery when they hit slow, cluttered,
              or confusing profile pages.
            </p>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-8 mt-16'>
              <div className='text-center'>
                <div className='text-3xl font-bold text-red-400'>73%</div>
                <div className='text-sm text-gray-500 dark:text-white/70'>
                  Abandon rate on slow pages
                </div>
              </div>
              <div className='text-center'>
                <div className='text-3xl font-bold text-yellow-400'>2.3s</div>
                <div className='text-sm text-gray-500 dark:text-white/70'>
                  Average load time on competitors
                </div>
              </div>
              <div className='text-center'>
                <div className='text-3xl font-bold text-green-400'>3.2x</div>
                <div className='text-sm text-gray-500 dark:text-white/70'>
                  Faster than Linktree
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
