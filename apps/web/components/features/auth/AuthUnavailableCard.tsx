import Link from 'next/link';

interface AuthUnavailableCardProps {
  /** Whether this surface is running on a real user-facing host; enables the reset CTA. */
  readonly showResetAction?: boolean;
}

export function AuthUnavailableCard({
  showResetAction = false,
}: AuthUnavailableCardProps = {}) {
  const actionClassName =
    'inline-flex min-h-[3.75rem] w-full items-center justify-center rounded-full border border-white/10 bg-white px-6 text-[15px] font-[590] tracking-[-0.02em] text-[#08090a] shadow-[0_18px_42px_rgba(0,0,0,0.28)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-white/15 hover:bg-[#f2f2f2] hover:shadow-[0_20px_46px_rgba(0,0,0,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/24';

  return (
    <section
      data-testid='auth-clerk-unavailable'
      className='w-full max-w-[30rem] space-y-6 text-center lg:text-left'
    >
      <div className='flex justify-center lg:justify-start'>
        <div className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium tracking-[-0.012em] text-white/70'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-white/55'
          />
          Auth unavailable
        </div>
      </div>

      <div className='space-y-2.5'>
        <h1 className='max-w-[10.5ch] text-[clamp(2.9rem,6.2vw,4.45rem)] font-[590] leading-[0.92] tracking-[-0.06em] text-white text-balance lg:max-w-[11.5ch]'>
          Sign in is temporarily unavailable
        </h1>
        <p className='mx-auto max-w-[26rem] text-[0.96rem] leading-[1.65] tracking-[-0.014em] text-white/60 text-pretty lg:mx-0'>
          {showResetAction
            ? "Something is off with this environment's auth. Try resetting your session — if it still fails, we've been notified."
            : 'Clerk is not configured for this environment.'}
        </p>
      </div>

      {showResetAction ? (
        <form
          action='/api/auth/reset'
          method='post'
          className='pt-1 flex justify-center lg:justify-start'
        >
          <button type='submit' className={actionClassName}>
            Reset session and retry
          </button>
        </form>
      ) : (
        <div className='flex justify-center pt-1 lg:justify-start'>
          <Link href='/' className={actionClassName}>
            Go to Homepage
          </Link>
        </div>
      )}

      <p className='text-[12px] leading-[1.6] tracking-[-0.01em] text-white/40'>
        If it still does not work, give it a moment and try again.
      </p>
    </section>
  );
}
