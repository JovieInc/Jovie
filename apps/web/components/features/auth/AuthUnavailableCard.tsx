import Link from 'next/link';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

interface AuthUnavailableCardProps {
  /** Whether this surface is running on a real user-facing host; enables the reset CTA. */
  readonly showResetAction?: boolean;
}

export function AuthUnavailableCard({
  showResetAction = false,
}: AuthUnavailableCardProps = {}) {
  return (
    <div
      data-testid='auth-clerk-unavailable'
      className={cn('w-full px-6 py-7 text-center', AUTH_SURFACE.card)}
    >
      <p className='text-[13px] font-[510] text-secondary-token'>
        Auth unavailable
      </p>
      <h1 className={cn(FORM_LAYOUT.title, 'mt-3')}>
        Sign in is temporarily unavailable
      </h1>
      <p className={cn(FORM_LAYOUT.hint, 'mt-3')}>
        {showResetAction
          ? "Something is off with this environment's auth. Try resetting your session — if it still fails, we've been notified."
          : 'Clerk is not configured for this environment.'}
      </p>
      {showResetAction ? (
        <form action='/api/auth/reset' method='post' className='mt-5'>
          <button
            type='submit'
            className='inline-flex text-[13px] font-[510] text-primary-token underline underline-offset-4 transition-opacity hover:opacity-90'
          >
            Reset session and retry
          </button>
        </form>
      ) : (
        <Link
          href='/'
          className='mt-5 inline-flex text-[13px] font-[510] text-primary-token underline underline-offset-4 transition-opacity hover:opacity-90'
        >
          Go to Homepage
        </Link>
      )}
    </div>
  );
}
