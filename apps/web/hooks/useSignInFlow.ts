'use client';

// Import from legacy to use the traditional hook API
// The new Clerk v7 uses signal-based hooks which have a different interface
import { useSignIn } from '@clerk/nextjs/legacy';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  isCodeExpired,
  isRateLimited,
  isSignUpSuggested,
  parseClerkError,
} from '@/lib/auth/clerk-errors';
import type { AuthMethod, LoadingState } from '@/lib/auth/types';

// Re-export types for backwards compatibility
export type { AuthMethod, LoadingState } from '@/lib/auth/types';

// Storage keys (matching existing implementation)
const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';
const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

export type SignInStep = 'method' | 'email' | 'verification';

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
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  // Step management
  const [step, setStep] = useState<SignInStep>('method');

  // Form state
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Loading & error state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    type: 'idle',
  });
  const [error, setError] = useState<string | null>(null);
  const [shouldSuggestSignUp, setShouldSuggestSignUp] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
    setShouldSuggestSignUp(false);
  }, []);

  /**
   * Get the redirect URL from session storage, falling back to dashboard
   */
  const getRedirectUrl = useCallback((): string => {
    try {
      const stored = window.sessionStorage.getItem(
        AUTH_REDIRECT_URL_STORAGE_KEY
      );
      if (stored?.startsWith('/') && !stored.startsWith('//')) {
        return stored;
      }
    } catch {
      // Ignore sessionStorage errors
    }
    return '/app/dashboard/overview';
  }, []);

  /**
   * Store the redirect URL from query params
   */
  const storeRedirectUrl = useCallback(() => {
    try {
      const redirectUrl = new URL(window.location.href).searchParams.get(
        'redirect_url'
      );
      if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')) {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_URL_STORAGE_KEY,
          redirectUrl
        );
      }
    } catch {
      // Ignore errors
    }
  }, []);

  /**
   * Persist the last used auth method for UX personalization
   */
  const persistAuthMethod = useCallback((method: AuthMethod) => {
    try {
      window.localStorage.setItem(LAST_AUTH_METHOD_STORAGE_KEY, method);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  /**
   * Start the email OTP flow - sends a verification code
   */
  const startEmailFlow = useCallback(
    async (emailAddress: string): Promise<boolean> => {
      if (!signIn || !isLoaded) return false;

      clearError();
      setLoadingState({ type: 'submitting' });
      setEmail(emailAddress);
      persistAuthMethod('email');

      try {
        // Create sign-in attempt with email
        const result = await signIn.create({
          identifier: emailAddress,
        });

        // Find email_code strategy in supported first factors
        const emailCodeFactor = result.supportedFirstFactors?.find(
          factor => factor.strategy === 'email_code'
        );

        if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
          setError('Email verification is not available for this account.');
          setLoadingState({ type: 'idle' });
          return false;
        }

        // Prepare first factor - this sends the verification code
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId as string,
        });

        setStep('verification');
        setLoadingState({ type: 'idle' });
        return true;
      } catch (err) {
        const message = parseClerkError(err);
        setError(message);
        setShouldSuggestSignUp(isSignUpSuggested(err));
        setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signIn, isLoaded, clearError, persistAuthMethod]
  );

  /**
   * Verify the OTP code and complete sign-in
   */
  const verifyCode = useCallback(
    async (verificationCode: string): Promise<boolean> => {
      if (!signIn || !isLoaded) return false;

      clearError();
      setLoadingState({ type: 'verifying' });
      setCode(verificationCode);

      try {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: verificationCode,
        });

        if (result.status === 'complete') {
          // Set the active session
          await setActive({ session: result.createdSessionId });

          // Navigate to the redirect URL
          const redirectUrl = getRedirectUrl();
          router.push(redirectUrl);

          return true;
        }

        // Handle other statuses (shouldn't happen for email_code)
        setError('Verification incomplete. Please try again.');
        setLoadingState({ type: 'idle' });
        return false;
      } catch (err) {
        const message = parseClerkError(err);
        setError(message);

        // If code expired, user can resend
        if (isCodeExpired(err)) {
          setError(
            'Your code has expired. Click "Resend code" to get a new one.'
          );
        }

        // Clear the code on error so user can re-enter
        setCode('');
        setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signIn, setActive, isLoaded, router, clearError, getRedirectUrl]
  );

  /**
   * Resend the verification code
   */
  const resendCode = useCallback(async (): Promise<boolean> => {
    if (!signIn || !isLoaded) return false;

    clearError();
    setLoadingState({ type: 'resending' });
    setCode('');

    try {
      // Find email_code factor
      const emailCodeFactor = signIn.supportedFirstFactors?.find(
        factor => factor.strategy === 'email_code'
      );

      if (!emailCodeFactor || !('emailAddressId' in emailCodeFactor)) {
        setError('Unable to resend code. Please start over.');
        setLoadingState({ type: 'idle' });
        return false;
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailCodeFactor.emailAddressId as string,
      });

      setLoadingState({ type: 'idle' });
      return true;
    } catch (err) {
      const message = parseClerkError(err);
      setError(message);

      if (isRateLimited(err)) {
        setError(
          'Too many attempts. Please wait before requesting a new code.'
        );
      }

      setLoadingState({ type: 'idle' });
      return false;
    }
  }, [signIn, isLoaded, clearError]);

  /**
   * Start OAuth flow (Google/Spotify)
   */
  const startOAuth = useCallback(
    async (provider: 'google' | 'spotify'): Promise<void> => {
      if (!signIn || !isLoaded) return;

      clearError();
      setLoadingState({ type: 'oauth', provider });
      persistAuthMethod(provider);
      storeRedirectUrl();

      try {
        await signIn.authenticateWithRedirect({
          strategy: `oauth_${provider}`,
          redirectUrl: '/signin/sso-callback',
          redirectUrlComplete: getRedirectUrl(),
        });
      } catch (err) {
        const message = parseClerkError(err);
        setError(message);
        setLoadingState({ type: 'idle' });
      }
    },
    [
      signIn,
      isLoaded,
      clearError,
      persistAuthMethod,
      storeRedirectUrl,
      getRedirectUrl,
    ]
  );

  /**
   * Go back to previous step
   */
  const goBack = useCallback(() => {
    clearError();
    setCode('');
    if (step === 'verification') {
      setStep('email');
    } else if (step === 'email') {
      setStep('method');
    }
  }, [step, clearError]);

  return {
    isLoaded,
    step,
    setStep,
    email,
    setEmail,
    code,
    setCode,
    loadingState,
    error,
    clearError,
    shouldSuggestSignUp,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  };
}
