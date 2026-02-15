'use client';

/**
 * Sign-in authentication flow hook using Clerk Core API.
 * Uses shared base logic from useAuthFlowBase.
 */

import { useCallback, useState } from 'react';
import { APP_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import {
  isCodeExpired,
  isSessionExists,
  isSignUpSuggested,
  parseClerkError,
} from '@/lib/auth/clerk-errors';
import type { LoadingState } from '@/lib/auth/types';
import { type AuthFlowStep, useAuthFlowBase } from './useAuthFlowBase';
import { useSignInSafe } from './useClerkSafe';

// Re-export types for backwards compatibility
export type { AuthMethod, LoadingState } from '@/lib/auth/types';
// Workaround for eslint - use AuthMethod via re-export

export type SignInStep = AuthFlowStep;

export interface UseSignInFlowReturn {
  // Clerk loaded state
  isLoaded: boolean;

  // Step management
  step: SignInStep;
  setStep: (step: SignInStep) => void;

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
  shouldSuggestSignUp: boolean;

  // Actions
  startEmailFlow: (email: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  resendCode: () => Promise<boolean>;
  startOAuth: (provider: 'google' | 'spotify') => Promise<void>;
  goBack: () => void;
}

/**
 * Hook that manages the complete sign-in flow using Clerk Core API.
 * Replaces the declarative Clerk Elements approach with imperative control.
 */
export function useSignInFlow(): UseSignInFlowReturn {
  const { signIn, setActive, isLoaded } = useSignInSafe();

  // Use shared auth flow base
  const base = useAuthFlowBase({
    defaultRedirectUrl: APP_ROUTES.DASHBOARD,
    useStoredRedirectUrl: true,
  });

  // Sign-in specific state
  const [shouldSuggestSignUp, setShouldSuggestSignUp] = useState(false);

  const clearError = useCallback(() => {
    base.clearError();
    setShouldSuggestSignUp(false);
  }, [base]);

  /**
   * Start the email OTP flow - sends a verification code
   */
  const startEmailFlow = useCallback(
    async (emailAddress: string): Promise<boolean> => {
      if (!signIn || !isLoaded) return false;

      clearError();
      base.setLoadingState({ type: 'submitting' });
      base.setEmail(emailAddress);
      base.persistAuthMethod('email');

      try {
        // Create sign-in attempt with email
        const result = await signIn.create({
          identifier: emailAddress,
        });

        // Find email_code strategy in supported first factors
        const emailCodeFactor = result.supportedFirstFactors?.find(
          (factor: { strategy: string }) => factor.strategy === 'email_code'
        );

        if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
          base.setError(
            'Email verification is not available for this account.'
          );
          base.setLoadingState({ type: 'idle' });
          return false;
        }

        // Prepare first factor - this sends the verification code
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId as string,
        });

        base.setStep('verification');
        base.setLoadingState({ type: 'idle' });
        return true;
      } catch (err) {
        // If user already has a session, redirect to dashboard
        if (isSessionExists(err)) {
          const redirectUrl = base.getRedirectUrl();
          base.router.push(redirectUrl);
          return false;
        }

        const message = parseClerkError(err);
        base.setError(message);
        setShouldSuggestSignUp(isSignUpSuggested(err));
        base.setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signIn, isLoaded, clearError, base]
  );

  /**
   * Verify the OTP code and complete sign-in
   */
  const verifyCode = useCallback(
    async (verificationCode: string): Promise<boolean> => {
      if (!signIn || !isLoaded) return false;

      // Prevent double-submission (auto-submit + manual submit can race)
      if (base.loadingState.type === 'verifying') {
        return false;
      }

      clearError();
      base.setLoadingState({ type: 'verifying' });
      base.setCode(verificationCode);

      try {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: verificationCode,
        });

        if (result.status === 'complete') {
          // Set the active session
          await setActive({ session: result.createdSessionId });

          // Navigate to the redirect URL
          const redirectUrl = base.getRedirectUrl();
          base.router.push(redirectUrl);

          return true;
        }

        // Handle other statuses (shouldn't happen for email_code)
        base.setError('Verification incomplete. Please try again.');
        base.setLoadingState({ type: 'idle' });
        return false;
      } catch (err) {
        const message = parseClerkError(err);
        base.setError(message);
        base.handleCodeExpiredError(err);

        // Keep the entered code visible so the user can see what they typed.
        // Only clear if the code expired (user needs a fresh one anyway).
        if (isCodeExpired(err)) {
          base.setCode('');
        }
        base.setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signIn, setActive, isLoaded, clearError, base]
  );

  /**
   * Resend the verification code
   */
  const resendCode = useCallback(async (): Promise<boolean> => {
    if (!signIn || !isLoaded) return false;

    clearError();
    base.setLoadingState({ type: 'resending' });
    base.setCode('');

    try {
      // Find email_code factor
      const emailCodeFactor = signIn.supportedFirstFactors?.find(
        (factor: { strategy: string }) => factor.strategy === 'email_code'
      );

      if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
        base.setError('Unable to resend code. Please start over.');
        base.setLoadingState({ type: 'idle' });
        return false;
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailCodeFactor.emailAddressId as string,
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
  }, [signIn, isLoaded, clearError, base]);

  /**
   * Start OAuth flow (Google/Spotify)
   */
  const startOAuth = useCallback(
    async (provider: 'google' | 'spotify'): Promise<void> => {
      if (!signIn || !isLoaded) return;

      clearError();
      base.setLoadingState({ type: 'oauth', provider });
      base.persistAuthMethod(provider);
      base.storeRedirectUrl();

      try {
        // Use absolute URLs (APP_URL) for OAuth callbacks to ensure consistent
        // behavior across local, preview, and production environments
        await signIn.authenticateWithRedirect({
          strategy: `oauth_${provider}`,
          redirectUrl: `${APP_URL}/signin/sso-callback`,
          redirectUrlComplete: `${APP_URL}/`,
        });
      } catch (err) {
        // If user already has a session, redirect to dashboard
        if (isSessionExists(err)) {
          const redirectUrl = base.getRedirectUrl();
          base.router.push(redirectUrl);
          return;
        }

        const message = parseClerkError(err);
        base.setError(message);
        base.setLoadingState({ type: 'idle' });
      }
    },
    [signIn, isLoaded, clearError, base]
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
    shouldSuggestSignUp,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  };
}
