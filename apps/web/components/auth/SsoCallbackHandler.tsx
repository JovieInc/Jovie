'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { captureError } from '@/lib/error-tracking';

/**
 * Hash fragments that indicate Clerk wants password-related action.
 * Since Jovie is passwordless, we intercept and redirect these cases.
 */
const PASSWORD_HASH_FRAGMENTS = [
  '#reset-password',
  '#/reset-password',
  '#forgot-password',
  '#/forgot-password',
  '#set-password',
  '#/set-password',
] as const;

/**
 * Props for SsoCallbackHandler component.
 */
interface SsoCallbackHandlerProps {
  /** URL to redirect to after successful sign-in */
  signInFallbackRedirectUrl: string;
  /** URL to redirect to after successful sign-up */
  signUpFallbackRedirectUrl: string;
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
  const searchParams = useSearchParams();
  const [isHandlingHash, setIsHandlingHash] = useState(false);

  // Track OAuth errors from URL params (Clerk passes errors via query params)
  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      void captureError(
        'SSO callback error',
        new Error(errorDescription || error),
        {
          route: window.location.pathname,
          error,
          errorDescription,
          component: 'SsoCallbackHandler',
        }
      );
    }
  }, [searchParams]);

  useEffect(() => {
    // Check for unexpected hash fragments that Clerk might add
    const hash = window.location.hash;

    if (PASSWORD_HASH_FRAGMENTS.some(fragment => hash.startsWith(fragment))) {
      setIsHandlingHash(true);

      // Clear the hash and redirect to dashboard
      // The user is already authenticated via OAuth at this point
      window.history.replaceState(null, '', window.location.pathname);

      // Use signInFallbackRedirectUrl as the default destination
      // since password prompts typically happen for existing users
      router.replace(signInFallbackRedirectUrl);
      return;
    }
  }, [router, signInFallbackRedirectUrl]);

  // If we're handling a hash redirect, show a loading state
  if (isHandlingHash) {
    return (
      <div className='flex items-center justify-center min-h-[200px]'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-token' />
      </div>
    );
  }

  // Otherwise, use Clerk's standard callback handler
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl={signInFallbackRedirectUrl}
      signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
    />
  );
}
