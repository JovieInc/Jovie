'use client';

/**
 * Sign-up authentication flow hook using Clerk Core API.
 * Uses shared base logic from useAuthFlowBase.
 */

import { useSignUp } from '@clerk/nextjs/legacy';
import { useCallback, useState } from 'react';
import { isSignInSuggested, parseClerkError } from '@/lib/auth/clerk-errors';
import type { LoadingState } from '@/lib/auth/types';
import { type AuthFlowStep, useAuthFlowBase } from './useAuthFlowBase';

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

  // Use shared auth flow base - sign-up always goes to onboarding
  const base = useAuthFlowBase({
    defaultRedirectUrl: '/onboarding',
    useStoredRedirectUrl: false,
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

          // Navigate to onboarding
          const redirectUrl = base.getRedirectUrl();
          base.router.push(redirectUrl);

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
        await signUp.authenticateWithRedirect({
          strategy: `oauth_${provider}`,
          redirectUrl: '/signup/sso-callback',
          redirectUrlComplete: base.getRedirectUrl(),
        });
      } catch (err) {
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
