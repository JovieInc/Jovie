'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const [isHandlingHash, setIsHandlingHash] = useState(false);

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
      window.history.replaceState(null, '', globalThis.location.pathname);

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
