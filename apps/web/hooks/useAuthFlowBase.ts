'use client';

/**
 * Shared base logic for sign-in and sign-up authentication flows.
 * Extracts common patterns to reduce duplication between useSignInFlow and useSignUpFlow.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  isCodeExpired,
  isRateLimited,
  parseClerkError,
} from '@/lib/auth/clerk-errors';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import type { AuthMethod, LoadingState } from '@/lib/auth/types';

// Re-export types for backwards compatibility
export type { AuthMethod, LoadingState } from '@/lib/auth/types';

// Storage keys (shared across sign-in and sign-up)
export const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';
export const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

export type AuthFlowStep = 'method' | 'email' | 'verification';

export interface AuthFlowState {
  step: AuthFlowStep;
  email: string;
  code: string;
  loadingState: LoadingState;
  error: string | null;
}

export interface UseAuthFlowBaseReturn {
  // State
  step: AuthFlowStep;
  setStep: (step: AuthFlowStep) => void;
  email: string;
  setEmail: (email: string) => void;
  code: string;
  setCode: (code: string) => void;
  loadingState: LoadingState;
  setLoadingState: (state: LoadingState) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Actions
  clearError: () => void;
  goBack: () => void;

  // Utilities
  router: ReturnType<typeof useRouter>;
  getRedirectUrl: () => string;
  storeRedirectUrl: () => void;
  persistAuthMethod: (method: AuthMethod) => void;

  // Error helpers
  handleClerkError: (err: unknown) => string;
  handleCodeExpiredError: (err: unknown) => void;
  handleRateLimitedError: (err: unknown) => void;
}

export interface UseAuthFlowBaseOptions {
  /** Default redirect URL after authentication (e.g., '/app' or '/onboarding') */
  defaultRedirectUrl: string;
  /** Whether to read redirect URL from session storage (true for sign-in, false for sign-up) */
  useStoredRedirectUrl?: boolean;
}

/**
 * Base hook providing shared authentication flow logic.
 * Used by both useSignInFlow and useSignUpFlow to reduce code duplication.
 */
export function useAuthFlowBase(
  options: UseAuthFlowBaseOptions
): UseAuthFlowBaseReturn {
  const { defaultRedirectUrl, useStoredRedirectUrl = false } = options;
  const router = useRouter();

  // Step management
  const [step, setStep] = useState<AuthFlowStep>('method');

  // Form state
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Loading & error state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    type: 'idle',
  });
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Get the redirect URL from session storage, falling back to default
   */
  const getRedirectUrl = useCallback((): string => {
    if (useStoredRedirectUrl) {
      try {
        const stored = window.sessionStorage.getItem(
          AUTH_REDIRECT_URL_STORAGE_KEY
        );
        const sanitized = sanitizeRedirectUrl(stored);
        if (sanitized) {
          return sanitized;
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
    return defaultRedirectUrl;
  }, [defaultRedirectUrl, useStoredRedirectUrl]);

  /**
   * Store the redirect URL from query params
   */
  const storeRedirectUrl = useCallback(() => {
    try {
      const redirectUrl = new URL(window.location.href).searchParams.get(
        'redirect_url'
      );
      const sanitized = sanitizeRedirectUrl(redirectUrl);
      if (sanitized) {
        window.sessionStorage.setItem(AUTH_REDIRECT_URL_STORAGE_KEY, sanitized);
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
   * Handle Clerk errors and return a user-friendly message
   */
  const handleClerkError = useCallback((err: unknown): string => {
    return parseClerkError(err);
  }, []);

  /**
   * Handle code expired error
   */
  const handleCodeExpiredError = useCallback((err: unknown) => {
    if (isCodeExpired(err)) {
      setError('Your code has expired. Click "Resend code" to get a new one.');
    }
  }, []);

  /**
   * Handle rate limited error
   */
  const handleRateLimitedError = useCallback((err: unknown) => {
    if (isRateLimited(err)) {
      setError('Too many attempts. Please wait before requesting a new code.');
    }
  }, []);

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
    // State
    step,
    setStep,
    email,
    setEmail,
    code,
    setCode,
    loadingState,
    setLoadingState,
    error,
    setError,

    // Actions
    clearError,
    goBack,

    // Utilities
    router,
    getRedirectUrl,
    storeRedirectUrl,
    persistAuthMethod,

    // Error helpers
    handleClerkError,
    handleCodeExpiredError,
    handleRateLimitedError,
  };
}
