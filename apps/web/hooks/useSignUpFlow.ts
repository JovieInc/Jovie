'use client';

/**
 * Sign-up authentication flow hook using Clerk Core API.
 * Uses shared base logic from useAuthFlowBase.
 */

import { useSignUp } from '@clerk/nextjs';
import { useCallback, useState } from 'react';
import { APP_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import {
  isSessionExists,
  isSignInSuggested,
  parseClerkError,
} from '@/lib/auth/clerk-errors';
import type { LoadingState } from '@/lib/auth/types';
import { logger } from '@/lib/utils/logger';
import { type AuthFlowStep, useAuthFlowBase } from './useAuthFlowBase';

/**
 * Wait for Clerk session to be fully propagated.
 * Polls until session is active or timeout is reached.
 *
 * This replaces the previous fixed 500ms timeout with a more reliable
 * polling mechanism that adapts to actual session readiness.
 *
 * @param maxWaitMs Maximum time to wait in milliseconds (default: 5000)
 * @param initialIntervalMs Initial poll interval in milliseconds (default: 50)
 * @returns Promise that resolves to true if session is ready, false if timed out
 * @internal Exported for testing purposes
 */
export async function waitForSession(
  maxWaitMs: number = 5000,
  initialIntervalMs: number = 50
): Promise<boolean> {
  const startTime = Date.now();
  let interval = initialIntervalMs;

  while (Date.now() - startTime < maxWaitMs) {
    // Check if Clerk session is active via the global Clerk client
    const clerk = (window as { Clerk?: { session?: { status?: string } } })
      .Clerk;
    if (clerk?.session?.status === 'active') {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    // Exponential backoff: increase interval up to 200ms for efficiency
    interval = Math.min(interval * 1.5, 200);
  }

  // Timed out - return false but still allow navigation as fallback
  return false;
}

// Re-export types for backwards compatibility
export type { AuthMethod, LoadingState } from '@/lib/auth/types';
// Workaround for eslint - use AuthMethod via re-export

export type SignUpStep = AuthFlowStep;

export interface UseSignUpFlowReturn {
  // Clerk loaded state
  isLoaded: boolean;

  // Step management
  step: SignUpStep;
  setStep: (step: SignUpStep) => void;

  // Form state
  email: string;
  setEmail: (email: string) => void;
  code: string;
  setCode: (code: string) => void;

  // Loading & error state
  loadingState: LoadingState;
  error: string | null;
  clearError: () => void;

  // Suggestions based on errors
  shouldSuggestSignIn: boolean;

  // Actions
  startEmailFlow: (email: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  resendCode: () => Promise<boolean>;
  startOAuth: (provider: 'google' | 'spotify') => Promise<void>;
  goBack: () => void;
}

/**
 * Hook that manages the complete sign-up flow using Clerk Core API.
 * Replaces the declarative Clerk Elements approach with imperative control.
 */
export function useSignUpFlow(): UseSignUpFlowReturn {
  const { signUp, setActive, isLoaded } = useSignUp();

  // Use shared auth flow base - sign-up goes to onboarding.
  // useStoredRedirectUrl: true so that a redirect_url stored by useAuthPageSetup
  // (e.g. /onboarding?handle=myhandle from the claim-handle form) is preserved.
  const base = useAuthFlowBase({
    defaultRedirectUrl: '/onboarding',
    useStoredRedirectUrl: true,
  });

  // Sign-up specific state
  const [shouldSuggestSignIn, setShouldSuggestSignIn] = useState(false);

  const clearError = useCallback(() => {
    base.clearError();
    setShouldSuggestSignIn(false);
  }, [base]);

  /**
   * Start the email OTP flow - sends a verification code
   */
  const startEmailFlow = useCallback(
    async (emailAddress: string): Promise<boolean> => {
      if (!signUp || !isLoaded) return false;

      clearError();
      base.setLoadingState({ type: 'submitting' });
      base.setEmail(emailAddress);
      base.persistAuthMethod('email');

      try {
        // Create sign-up with email
        await signUp.create({
          emailAddress,
        });

        // Prepare email verification - this sends the code
        await signUp.prepareEmailAddressVerification({
          strategy: 'email_code',
        });

        base.setStep('verification');
        base.setLoadingState({ type: 'idle' });
        return true;
      } catch (err) {
        // If user already has a session, redirect to dashboard
        if (isSessionExists(err)) {
          base.router.push(APP_ROUTES.DASHBOARD);
          return false;
        }

        const message = parseClerkError(err);
        base.setError(message);
        setShouldSuggestSignIn(isSignInSuggested(err));
        base.setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signUp, isLoaded, clearError, base]
  );

  /**
   * Verify the OTP code and complete sign-up
   */
  const verifyCode = useCallback(
    async (verificationCode: string): Promise<boolean> => {
      if (!signUp || !isLoaded) return false;

      clearError();
      base.setLoadingState({ type: 'verifying' });
      base.setCode(verificationCode);

      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode,
        });

        if (result.status === 'complete') {
          // Set the active session
          await setActive({ session: result.createdSessionId });

          // CRITICAL: Wait for session to propagate before redirecting
          // This prevents race conditions where onboarding page loads before
          // the session is fully available, causing redirect loops
          base.setLoadingState({ type: 'completing' });

          // Poll for session readiness instead of fixed timeout
          // This adapts to actual propagation time and avoids unnecessary delays
          const sessionReady = await waitForSession();

          // Navigate even if timeout occurred - the session should be ready
          // by the time the page loads, and the fresh_signup flag provides
          // additional protection against redirect loops
          if (!sessionReady) {
            logger.warn(
              'Session polling timed out, proceeding with redirect',
              undefined,
              'useSignUpFlow'
            );
          }

          // Navigate to onboarding with fresh_signup flag for loop detection.
          // Use URL separator that respects existing query params (e.g. ?handle=x).
          const redirectUrl = base.getRedirectUrl();
          const separator = redirectUrl.includes('?') ? '&' : '?';
          base.router.push(`${redirectUrl}${separator}fresh_signup=true`);

          return true;
        }

        // Handle other statuses
        if (result.status === 'missing_requirements') {
          // There may be additional verification needed
          base.setError('Additional verification required. Please try again.');
        } else {
          base.setError('Sign-up incomplete. Please try again.');
        }
        base.setLoadingState({ type: 'idle' });
        return false;
      } catch (err) {
        const message = parseClerkError(err);
        base.setError(message);
        base.handleCodeExpiredError(err);

        // Clear the code on error so user can re-enter
        base.setCode('');
        base.setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signUp, setActive, isLoaded, clearError, base]
  );

  /**
   * Resend the verification code
   */
  const resendCode = useCallback(async (): Promise<boolean> => {
    if (!signUp || !isLoaded) return false;

    clearError();
    base.setLoadingState({ type: 'resending' });
    base.setCode('');

    try {
      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      base.setLoadingState({ type: 'idle' });
      return true;
    } catch (err) {
      const message = parseClerkError(err);
      base.setError(message);
      base.handleRateLimitedError(err);
      base.setLoadingState({ type: 'idle' });
      return false;
    }
  }, [signUp, isLoaded, clearError, base]);

  /**
   * Start OAuth flow (Google/Spotify)
   */
  const startOAuth = useCallback(
    async (provider: 'google' | 'spotify'): Promise<void> => {
      if (!signUp || !isLoaded) return;

      clearError();
      base.setLoadingState({ type: 'oauth', provider });
      base.persistAuthMethod(provider);
      base.storeRedirectUrl();

      try {
        // Use absolute URLs (APP_URL) for OAuth callbacks to ensure consistent
        // behavior across local, preview, and production environments.
        // Include the stored redirect URL (which may contain ?handle=X from the
        // claim form) so the handle survives the OAuth round-trip.
        const storedRedirect = base.getRedirectUrl(); // falls back to /onboarding
        await signUp.authenticateWithRedirect({
          strategy: `oauth_${provider}`,
          redirectUrl: `${APP_URL}/signup/sso-callback`,
          redirectUrlComplete: `${APP_URL}${storedRedirect}`,
        });
      } catch (err) {
        // If user already has a session, redirect to dashboard
        if (isSessionExists(err)) {
          base.router.push(APP_ROUTES.DASHBOARD);
          return;
        }

        const message = parseClerkError(err);
        base.setError(message);
        base.setLoadingState({ type: 'idle' });
      }
    },
    [signUp, isLoaded, clearError, base]
  );

  /**
   * Go back to previous step
   */
  const goBack = useCallback(() => {
    clearError();
    base.goBack();
  }, [clearError, base]);

  return {
    isLoaded,
    step: base.step,
    setStep: base.setStep,
    email: base.email,
    setEmail: base.setEmail,
    code: base.code,
    setCode: base.setCode,
    loadingState: base.loadingState,
    error: base.error,
    clearError,
    shouldSuggestSignIn,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  };
}
