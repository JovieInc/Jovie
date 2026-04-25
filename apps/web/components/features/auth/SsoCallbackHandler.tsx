'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import {
  isAccessDeniedError,
  isAccountExistsError,
} from '@/lib/auth/clerk-errors';
import { logger } from '@/lib/utils/logger';

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
    <output
      className='flex flex-col items-center justify-center gap-4 animate-in fade-in duration-500 ease-out'
      aria-busy='true'
      aria-live='polite'
    >
      <LoadingSpinner size='md' tone='muted' label='Signing you in' />
      <p className='text-app text-tertiary-token'>
        {isStalled ? 'Still signing you in…' : 'Signing you in…'}
      </p>
      {isStalled && (
        <p className='text-xs text-tertiary-token/70 text-center max-w-xs'>
          This is taking longer than expected. You can{' '}
          <Link
            href='/signin'
            className='text-primary-token underline focus-ring-themed rounded-md'
          >
            try signing in again
          </Link>
          .
        </p>
      )}
    </output>
  );
}

/**
 * Classify an OAuth callback error into a query param value for the signup page.
 * Uses Clerk error codes to provide specific error messages downstream.
 */
function classifyOAuthError(error: unknown): string {
  if (isAccountExistsError(error)) return 'account_exists';
  if (isAccessDeniedError(error)) return 'access_denied';
  return 'unknown';
}

/**
 * Handles OAuth SSO callbacks using Clerk's imperative API.
 *
 * Processes the OAuth redirect, handling:
 * - Successful sign-up (new account) → navigates to signUpFallbackRedirectUrl
 * - Successful transfer (existing account) → auto-signs in, navigates to signInFallbackRedirectUrl
 * - Account exists error → redirects to /signup with specific error param
 * - Access denied error → redirects to /signup with specific error param
 * - Other errors → redirects to /signup with generic error param
 *
 * Also handles unexpected hash fragments from Clerk's internal routing
 * (e.g., #reset-password) since Jovie uses passwordless auth only.
 */
export function SsoCallbackHandler({
  signInFallbackRedirectUrl,
  signUpFallbackRedirectUrl,
}: Readonly<SsoCallbackHandlerProps>) {
  const clerk = useClerk();
  const router = useRouter();
  const [isHandlingHash, setIsHandlingHash] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const callbackInitiated = useRef(false);

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

  // Process the OAuth callback imperatively
  useEffect(() => {
    // Guard against double-invocation in React strict mode
    if (callbackInitiated.current) return;
    // Skip if we're handling a hash redirect instead
    if (isHandlingHash) return;

    callbackInitiated.current = true;

    clerk
      .handleRedirectCallback({
        signInFallbackRedirectUrl,
        signUpFallbackRedirectUrl,
        transferable: true,
      })
      .catch((err: unknown) => {
        const errorType = classifyOAuthError(err);

        logger.warn(
          'OAuth callback failed',
          {
            errorType,
            error: err instanceof Error ? err.message : String(err),
          },
          'SsoCallbackHandler'
        );

        // Redirect to signup page with error classification so it can
        // show the appropriate error message using existing OAuth error UI
        router.replace(`/signup?oauth_error=${errorType}`);
      });
  }, [
    clerk,
    router,
    isHandlingHash,
    signInFallbackRedirectUrl,
    signUpFallbackRedirectUrl,
  ]);

  // Stall detection: if the callback hasn't resolved after a timeout, show help
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStalled(true);
    }, STALL_TIMEOUT_SECONDS * 1000);

    return () => clearTimeout(timer);
  }, []);

  return <SsoLoadingState isStalled={isStalled} />;
}
