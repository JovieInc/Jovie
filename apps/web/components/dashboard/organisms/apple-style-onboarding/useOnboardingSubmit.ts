'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { identify, track } from '@/lib/analytics';
import {
  extractErrorCode,
  getErrorMessage,
  isDatabaseError,
  mapErrorToUserMessage,
} from './errors';
import type { HandleValidationState, OnboardingState } from './types';
import {
  canSubmitOnboarding,
  getResolvedHandle,
  validateDisplayName,
} from './validation';

interface UseOnboardingSubmitOptions {
  userId: string;
  userEmail: string | null;
  fullName: string;
  handle: string;
  handleInput: string;
  handleValidation: HandleValidationState;
  goToNextStep: () => void;
  setProfileReadyHandle: (handle: string) => void;
}

interface UseOnboardingSubmitReturn {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
}

/**
 * Hook to manage onboarding form submission.
 */
export function useOnboardingSubmit({
  userId,
  userEmail,
  fullName,
  handle,
  handleInput,
  handleValidation,
  goToNextStep,
  setProfileReadyHandle,
}: UseOnboardingSubmitOptions): UseOnboardingSubmitReturn {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>({
    step: 'validating',
    progress: 0,
    error: null,
    retryCount: 0,
    isSubmitting: false,
  });

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();

      const resolvedHandle = getResolvedHandle(handle, handleInput);
      const redirectUrl = `/onboarding?handle=${encodeURIComponent(resolvedHandle)}`;

      // Early return if form cannot be submitted
      if (
        !canSubmitOnboarding({
          handle,
          handleInput,
          handleValidation,
          isSubmitting: state.isSubmitting,
          hasError: Boolean(state.error),
        })
      ) {
        return;
      }

      // Track submission start
      track('onboarding_submission_started', {
        user_id: userId,
        handle: resolvedHandle,
      });

      identify(userId, {
        email: userEmail ?? undefined,
        handle: resolvedHandle,
        onboarding_started_at: new Date().toISOString(),
      });

      setState(prev => ({
        ...prev,
        error: null,
        step: 'validating',
        isSubmitting: true,
      }));

      try {
        validateDisplayName(fullName);
        await completeOnboarding({
          username: resolvedHandle,
          displayName: fullName.trim(),
          email: userEmail,
          redirectToDashboard: false,
        });

        setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
        setProfileReadyHandle(resolvedHandle);

        track('onboarding_completed', {
          user_id: userId,
          handle: resolvedHandle,
          completion_time: new Date().toISOString(),
        });

        goToNextStep();
      } catch (error) {
        // Handle Next.js redirect special case
        const errMsg = getErrorMessage(error);
        if (errMsg === 'NEXT_REDIRECT') {
          setState(prev => ({
            ...prev,
            step: 'complete',
            progress: 100,
            isSubmitting: false,
          }));
          return;
        }

        const errorCode = extractErrorCode(error);

        // Handle database errors with retry suggestion
        if (isDatabaseError(error)) {
          console.error(
            '[ONBOARDING] Database error detected, suggesting retry'
          );
          setState(prev => ({
            ...prev,
            error:
              "We couldn't finish setting up your account. Please try again in a moment.",
            step: 'validating',
            progress: 0,
            isSubmitting: false,
          }));
          track('onboarding_error', {
            user_id: userId,
            handle: resolvedHandle,
            error_message: errMsg,
            error_code: 'DATABASE_ERROR',
            error_step: 'submission',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Track error
        track('onboarding_error', {
          user_id: userId,
          handle: resolvedHandle,
          error_message: errMsg,
          error_code: errorCode,
          error_step: 'submission',
          timestamp: new Date().toISOString(),
        });

        // Map error to user-friendly message
        const { userMessage, shouldRedirectToSignIn } = mapErrorToUserMessage(
          error,
          redirectUrl
        );

        // Handle sign-in redirect for email conflicts
        if (shouldRedirectToSignIn) {
          router.push(
            `/signin?redirect_url=${encodeURIComponent(redirectUrl)}`
          );
          return;
        }

        setState(prev => ({
          ...prev,
          error: userMessage,
          step: 'validating',
          progress: 0,
          isSubmitting: false,
        }));
      }
    },
    [
      fullName,
      goToNextStep,
      handle,
      handleInput,
      handleValidation,
      router,
      setProfileReadyHandle,
      state.error,
      state.isSubmitting,
      userEmail,
      userId,
    ]
  );

  return {
    state,
    setState,
    handleSubmit,
  };
}
