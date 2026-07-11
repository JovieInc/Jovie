'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';

interface AuthUnavailableCardProps {
  /** Whether this surface is running on a real user-facing host; enables the reset CTA. */
  readonly showResetAction?: boolean;
  /** Override the auth flow detection (defaults to deriving from pathname). */
  readonly mode?: 'signin' | 'signup';
}

function resolveMode(
  override: 'signin' | 'signup' | undefined,
  pathname: string | null
): 'signin' | 'signup' {
  if (override) return override;
  if (pathname?.startsWith(APP_ROUTES.SIGNUP)) return 'signup';
  return 'signin';
}

export function AuthUnavailableCard({
  showResetAction = false,
  mode,
}: AuthUnavailableCardProps = {}) {
  const pathname = usePathname();
  const resolvedMode = resolveMode(mode, pathname);
  const showSignupLegal = resolvedMode === 'signup';
  const headline =
    resolvedMode === 'signup'
      ? 'Sign up is temporarily unavailable'
      : 'Sign in is temporarily unavailable';
  const actionClassName =
    'inline-flex h-(--linear-button-height-md) min-h-10 w-full items-center justify-center rounded-full border border-subtle bg-white dark:bg-surface-1 px-4 text-(--linear-caption-size) font-(--linear-caption-weight) text-(--color-bg-base) shadow-(--linear-shadow-button) transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out hover:bg-white dark:bg-surface-1/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:opacity-70';

  return (
    <section
      data-testid='auth-clerk-unavailable'
      data-auth-mode={resolvedMode}
      className='mx-auto flex w-full max-w-[22rem] flex-col items-center text-center'
    >
      <BrandLogo
        size={34}
        tone='white'
        rounded={false}
        aria-hidden
        className='opacity-90'
      />

      <div className='mt-5 space-y-2'>
        <h1 className='text-[1.5rem] font-[650] leading-[1.16] tracking-tighter text-white dark:text-white text-balance'>
          {headline}
        </h1>
        <p className='mx-auto max-w-[20rem] text-[0.875rem] leading-[1.55] tracking-[-0.011em] text-white/60 text-pretty'>
          This environment&apos;s sign-in setup is not ready.
        </p>
      </div>

      {showResetAction ? (
        <form
          action='/api/auth/reset'
          method='post'
          className='mt-5 flex w-full justify-center'
        >
          <button type='submit' className={actionClassName}>
            Reset session and retry
          </button>
        </form>
      ) : (
        <div className='mt-5 flex w-full justify-center'>
          <Link href='/' className={actionClassName}>
            Go to Homepage
          </Link>
        </div>
      )}

      {showSignupLegal ? (
        <p className='mt-4 text-xs leading-[1.6] tracking-tight text-white/50'>
          By signing up, you agree to our{' '}
          <Link
            href={APP_ROUTES.LEGAL_TERMS}
            className='rounded-md text-white/76 underline underline-offset-2 focus-ring-themed'
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href={APP_ROUTES.LEGAL_PRIVACY}
            className='rounded-md text-white/76 underline underline-offset-2 focus-ring-themed'
          >
            Privacy Policy
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
