'use client';

// Import from legacy to use the traditional hook API
// The new Clerk v7 uses signal-based hooks which have a different interface
import { useSignUp } from '@clerk/nextjs/legacy';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  isCodeExpired,
  isRateLimited,
  isSignInSuggested,
  parseClerkError,
} from '@/lib/auth/clerk-errors';

// Storage keys (matching existing implementation)
const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';
const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

export type SignUpStep = 'method' | 'email' | 'verification';
export type AuthMethod = 'email' | 'google' | 'spotify';

export type LoadingState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'verifying' }
  | { type: 'resending' }
  | { type: 'oauth'; provider: 'google' | 'spotify' };

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
  const router = useRouter();

  // Step management
  const [step, setStep] = useState<SignUpStep>('method');

  // Form state
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Loading & error state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    type: 'idle',
  });
  const [error, setError] = useState<string | null>(null);
  const [shouldSuggestSignIn, setShouldSuggestSignIn] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
    setShouldSuggestSignIn(false);
  }, []);

  /**
   * Get the redirect URL - for sign-up, always go to onboarding first
   */
  const getRedirectUrl = useCallback((): string => {
    // New users always go through onboarding
    return '/onboarding';
  }, []);

  /**
   * Store the redirect URL from query params (for post-onboarding)
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
      if (!signUp || !isLoaded) return false;

      clearError();
      setLoadingState({ type: 'submitting' });
      setEmail(emailAddress);
      persistAuthMethod('email');

      try {
        // Create sign-up with email
        await signUp.create({
          emailAddress,
        });

        // Prepare email verification - this sends the code
        await signUp.prepareEmailAddressVerification({
          strategy: 'email_code',
        });

        setStep('verification');
        setLoadingState({ type: 'idle' });
        return true;
      } catch (err) {
        const message = parseClerkError(err);
        setError(message);
        setShouldSuggestSignIn(isSignInSuggested(err));
        setLoadingState({ type: 'idle' });
        return false;
      }
    },
    [signUp, isLoaded, clearError, persistAuthMethod]
  );

  /**
   * Verify the OTP code and complete sign-up
   */
  const verifyCode = useCallback(
    async (verificationCode: string): Promise<boolean> => {
      if (!signUp || !isLoaded) return false;

      clearError();
      setLoadingState({ type: 'verifying' });
      setCode(verificationCode);

      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode,
        });

        if (result.status === 'complete') {
          // Set the active session
          await setActive({ session: result.createdSessionId });

          // Navigate to onboarding
          const redirectUrl = getRedirectUrl();
          router.push(redirectUrl);

          return true;
        }

        // Handle other statuses
        if (result.status === 'missing_requirements') {
          // There may be additional verification needed
          setError('Additional verification required. Please try again.');
        } else {
          setError('Sign-up incomplete. Please try again.');
        }
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
    [signUp, setActive, isLoaded, router, clearError, getRedirectUrl]
  );

  /**
   * Resend the verification code
   */
  const resendCode = useCallback(async (): Promise<boolean> => {
    if (!signUp || !isLoaded) return false;

    clearError();
    setLoadingState({ type: 'resending' });
    setCode('');

    try {
      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
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
  }, [signUp, isLoaded, clearError]);

  /**
   * Start OAuth flow (Google/Spotify)
   */
  const startOAuth = useCallback(
    async (provider: 'google' | 'spotify'): Promise<void> => {
      if (!signUp || !isLoaded) return;

      clearError();
      setLoadingState({ type: 'oauth', provider });
      persistAuthMethod(provider);
      storeRedirectUrl();

      try {
        await signUp.authenticateWithRedirect({
          strategy: `oauth_${provider}`,
          redirectUrl: '/signup/sso-callback',
          redirectUrlComplete: getRedirectUrl(),
        });
      } catch (err) {
        const message = parseClerkError(err);
        setError(message);
        setLoadingState({ type: 'idle' });
      }
    },
    [
      signUp,
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
    shouldSuggestSignIn,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  };
}
