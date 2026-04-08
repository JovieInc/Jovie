import Link from 'next/link';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

export function AuthUnavailableCard() {
  return (
    <div
      data-testid='auth-clerk-unavailable'
      className={cn('w-full px-6 py-7 text-center', AUTH_SURFACE.card)}
    >
      <p className='text-[13px] font-[510] text-secondary-token'>
        Auth unavailable
      </p>
      <h1 className={cn(FORM_LAYOUT.title, 'mt-3')}>
        Clerk isn&apos;t configured here
      </h1>
      <p className={cn(FORM_LAYOUT.hint, 'mt-3')}>
        Clerk is not configured for this environment.
      </p>
      <Link
        href='/'
        className='mt-5 inline-flex text-[13px] font-[510] text-primary-token underline underline-offset-4 transition-opacity hover:opacity-90'
      >
        Go to homepage
      </Link>
    </div>
  );
}
