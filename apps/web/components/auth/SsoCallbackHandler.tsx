'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Seconds before showing stall message */
const STALL_TIMEOUT_SECONDS = 10;

/**
 * Props for SsoCallbackHandler component.
 */
interface SsoCallbackHandlerProps {
  /** URL to redirect to after successful sign-in */
  readonly signInFallbackRedirectUrl: string;
  /** URL to redirect to after successful sign-up */
  readonly signUpFallbackRedirectUrl: string;
}

/**
 * Loading state shown during SSO callback processing.
 * Displays a spinner with status text, aria-busy for assistive tech,
 * and a stall message if the callback takes too long.
 */
function SsoLoadingState({ isStalled }: { readonly isStalled: boolean }) {
  return (
    <div
      className='flex flex-col items-center justify-center min-h-[200px] gap-3'
      role='status'
      aria-busy='true'
      aria-live='polite'
    >
      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-token' />
      <p className='text-sm text-secondary-token'>
        {isStalled ? 'Still signing you in…' : 'Signing you in…'}
      </p>
      {isStalled && (
        <p className='text-xs text-secondary-token/70 text-center max-w-xs'>
          This is taking longer than expected. You can{' '}
          <Link
            href='/signin'
            className='text-primary-token hover:underline focus-ring-themed rounded-md'
          >
            try signing in again
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * Wrapper around Clerk's AuthenticateWithRedirectCallback that handles
 * unexpected hash fragments from Clerk's internal routing.
 *
 * Clerk may add hash fragments like #reset-password when it detects certain
 * account states (e.g., password auth enabled in dashboard). Since Jovie uses
 * passwordless auth only, we intercept and redirect these cases appropriately.
 */
export function SsoCallbackHandler({
  signInFallbackRedirectUrl,
  signUpFallbackRedirectUrl,
}: Readonly<SsoCallbackHandlerProps>) {
  const router = useRouter();
  const [isHandlingHash, setIsHandlingHash] = useState(false);
  const [isStalled, setIsStalled] = useState(false);

  useEffect(() => {
    // Check for unexpected hash fragments that Clerk might add
    const hash = globalThis.location.hash;

    // List of hash fragments that indicate Clerk wants password-related action
    // Since Jovie is passwordless, we redirect to dashboard/onboarding instead
    const passwordHashFragments = [
      '#reset-password',
      '#/reset-password',
      '#forgot-password',
      '#/forgot-password',
      '#set-password',
      '#/set-password',
    ];

    if (passwordHashFragments.some(fragment => hash.startsWith(fragment))) {
      setIsHandlingHash(true);

      // Clear the hash and redirect to dashboard
      // The user is already authenticated via OAuth at this point
      globalThis.history.replaceState(null, '', globalThis.location.pathname);

      // Use signInFallbackRedirectUrl as the default destination
      // since password prompts typically happen for existing users
      router.replace(signInFallbackRedirectUrl);
    }
  }, [router, signInFallbackRedirectUrl]);

  // Stall detection: if the callback hasn't resolved after a timeout, show help
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStalled(true);
    }, STALL_TIMEOUT_SECONDS * 1000);

    return () => clearTimeout(timer);
  }, []);

  // If we're handling a hash redirect, show a loading state
  if (isHandlingHash) {
    return <SsoLoadingState isStalled={isStalled} />;
  }

  // Clerk's callback handler processes the OAuth redirect via JS.
  // We render our loading state visually and keep Clerk's component mounted
  // (visually hidden but not display:none, so it can still process).
  return (
    <>
      <SsoLoadingState isStalled={isStalled} />
      <div className='sr-only'>
        <AuthenticateWithRedirectCallback
          signInFallbackRedirectUrl={signInFallbackRedirectUrl}
          signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
        />
      </div>
    </>
  );
}
