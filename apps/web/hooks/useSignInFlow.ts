'use client';

/**
 * Sign-in authentication flow hook using Clerk Core API.
 * Uses shared base logic from useAuthFlowBase.
 */

import { useCallback, useState } from 'react';
import { APP_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import {
  getOAuthErrorMessage,
  isCodeExpired,
  isSessionExists,
  isSignUpSuggested,
  parseClerkError,
} from '@/lib/auth/clerk-errors';
import type { LoadingState } from '@/lib/auth/types';
import { type AuthFlowStep, useAuthFlowBase } from './useAuthFlowBase';
import { useSignInSafe } from './useClerkSafe';

/** Use current origin for OAuth callbacks so localhost works correctly */
const getOAuthBaseUrl = () =>
  typeof window !== 'undefined' ? window.location.origin : APP_URL;

// Re-export types for backwards compatibility
export type { AuthMethod, LoadingState } from '@/lib/auth/types';
// Workaround for eslint - use AuthMethod via re-export

export type SignInStep = AuthFlowStep;

/** Why the verification step is being shown */
export type VerificationReason = 'code' | 'mfa' | 'device_trust';

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

  // Verification context — lets the UI show different copy for
  // normal OTP vs MFA vs device trust challenges.
  verificationReason: VerificationReason;

  // Actions
  startEmailFlow: (email: string) => Promise<boolean>;
  verifyCode: (code: string) => Promise<boolean>;
  resendCode: () => Promise<boolean>;
  startOAuth: () => Promise<void>;
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
  const [isSecondFactor, setIsSecondFactor] = useState(false);
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<
    'email_code' | 'phone_code'
  >('email_code');
  const [verificationReason, setVerificationReason] =
    useState<VerificationReason>('code');

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
      setIsSecondFactor(false);
      setSecondFactorStrategy('email_code');
      setVerificationReason('code');
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
   * Verify the OTP code and complete sign-in.
   *
   * Handles both first-factor (normal OTP) and second-factor (MFA /
   * client trust) verification in a single function. When the first
   * factor returns needs_second_factor or needs_client_trust, we
   * prepare the second factor and loop back to the verification step.
   * On the next call, isSecondFactor is true so we call
   * attemptSecondFactor instead.
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
        // If we're in a second-factor state, verify via attemptSecondFactor
        if (isSecondFactor) {
          const result = await signIn.attemptSecondFactor({
            strategy: secondFactorStrategy,
            code: verificationCode,
          });

          if (result.status === 'complete') {
            await setActive({ session: result.createdSessionId });
            const redirectUrl = base.getRedirectUrl();
            base.router.push(redirectUrl);
            return true;
          }

          base.setError('Verification incomplete. Please try again.');
          base.setLoadingState({ type: 'idle' });
          return false;
        }

        // Normal first-factor verification
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

        // MFA / Client Trust: user needs a second factor challenge.
        // Our flow is passwordless so this shouldn't normally trigger,
        // but handles the case where a user has MFA enabled on their
        // Clerk account, or Clerk introduces client trust challenges.
        // TODO: Remove `as string` cast when @clerk/shared types include 'needs_client_trust'
        if (
          result.status === 'needs_second_factor' ||
          (result.status as string) === 'needs_client_trust'
        ) {
          const secondFactor = signIn.supportedSecondFactors?.find(
            (f: { strategy: string }) =>
              f.strategy === 'email_code' || f.strategy === 'phone_code'
          );

          if (secondFactor) {
            const strategy = secondFactor.strategy as
              | 'email_code'
              | 'phone_code';
            await signIn.prepareSecondFactor({ strategy });
            setIsSecondFactor(true);
            setSecondFactorStrategy(strategy);
            setVerificationReason(
              (result.status as string) === 'needs_client_trust'
                ? 'device_trust'
                : 'mfa'
            );
            base.setStep('verification');
            base.setCode('');
            base.setLoadingState({ type: 'idle' });
            return false;
          }

          // No email/phone second factor available — can't proceed
          base.setError(
            'Additional verification is required. Please contact support.'
          );
          base.setLoadingState({ type: 'idle' });
          return false;
        }

        // Statuses that shouldn't occur after attemptFirstFactor in our
        // passwordless flow, but handle defensively with clear messages.
        if (result.status === 'needs_new_password') {
          base.setError(
            'Password setup is not supported. Please sign in with email or Google.'
          );
          base.setLoadingState({ type: 'idle' });
          return false;
        }

        // Catch-all for needs_first_factor, needs_identifier, or any
        // future unknown statuses.
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
    [
      signIn,
      setActive,
      isLoaded,
      isSecondFactor,
      secondFactorStrategy,
      clearError,
      base,
    ]
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
      // If we're in a second-factor state, resend the second-factor
      // challenge instead of the first-factor email code.
      if (isSecondFactor) {
        await signIn.prepareSecondFactor({
          strategy: secondFactorStrategy,
        });
        base.setLoadingState({ type: 'idle' });
        return true;
      }

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
  }, [
    signIn,
    isLoaded,
    isSecondFactor,
    secondFactorStrategy,
    clearError,
    base,
  ]);

  /**
   * Start OAuth flow (Google)
   */
  const startOAuth = useCallback(async (): Promise<void> => {
    if (!signIn || !isLoaded) return;

    const provider = 'google';

    clearError();
    base.setLoadingState({ type: 'oauth', provider });
    base.persistAuthMethod(provider);
    base.storeRedirectUrl();

    try {
      // Use current origin for OAuth callbacks so localhost, preview, and
      // production all redirect correctly after the OAuth round-trip.
      const oauthBase = getOAuthBaseUrl();
      const storedRedirect = base.getRedirectUrl();
      await signIn.authenticateWithRedirect({
        strategy: `oauth_${provider}`,
        redirectUrl: `${oauthBase}/signin/sso-callback`,
        redirectUrlComplete: `${oauthBase}${storedRedirect}`,
      });
    } catch (err) {
      // If user already has a session, redirect to dashboard
      if (isSessionExists(err)) {
        const redirectUrl = base.getRedirectUrl();
        base.router.push(redirectUrl);
        return;
      }

      const message = parseClerkError(err);
      base.setError(getOAuthErrorMessage(message));
      base.setLoadingState({ type: 'idle' });
    }
  }, [signIn, isLoaded, clearError, base]);

  /**
   * Go back to previous step
   */
  const goBack = useCallback(() => {
    clearError();
    setIsSecondFactor(false);
    setSecondFactorStrategy('email_code');
    setVerificationReason('code');
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
    verificationReason,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  };
}
