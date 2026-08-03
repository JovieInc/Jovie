import Link from 'next/link';

interface PublicProfileErrorStateProps {
  readonly retryHref: string;
}

/**
 * Server-rendered recovery state for a transient public-profile read failure.
 * Keeping this path server-only prevents the general interactive ErrorBanner
 * (clipboard, toast, disclosure, and button dependencies) from joining every
 * successful profile's initial client graph.
 */
export function PublicProfileErrorState({
  retryHref,
}: PublicProfileErrorStateProps) {
  return (
    <main className='px-4 py-8'>
      <section
        role='alert'
        aria-live='assertive'
        aria-labelledby='public-profile-error-title'
        data-testid='public-profile-error'
        className='mx-auto max-w-lg rounded-2xl border border-error/30 bg-error-subtle px-5 py-4 text-error-foreground shadow-xl backdrop-blur-sm dark:border-error/40'
      >
        <div className='flex gap-3'>
          <span
            className='mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-200 shadow-inner dark:border-red-700/60 dark:bg-red-900/40'
            aria-hidden='true'
          >
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-5 w-5'
            >
              <title>Warning</title>
              <path d='M21.73 18 13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' />
              <path d='M12 9v4' />
              <path d='M12 17h.01' />
            </svg>
          </span>

          <div className='min-w-0 flex-1'>
            <h1
              id='public-profile-error-title'
              className='text-sm font-semibold leading-snug tracking-tight'
            >
              Profile Is Temporarily Unavailable
            </h1>
            <p className='mt-1.5 text-sm leading-snug text-red-100/90 dark:text-red-100/80'>
              We could not load this profile right now, so please refresh or try
              again in a few minutes.
            </p>
            <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
              <Link
                href={retryHref}
                className='inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-950 dark:bg-white dark:text-black'
              >
                Try Again
              </Link>
              <Link
                href='/'
                className='inline-flex min-h-11 items-center justify-center rounded-full border border-red-100/20 px-4 text-sm font-semibold text-red-50 transition-colors hover:bg-red-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-950'
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
