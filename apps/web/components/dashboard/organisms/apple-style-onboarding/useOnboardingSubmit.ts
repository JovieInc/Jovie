'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { identify, track } from '@/lib/analytics';
import type { HandleValidationState, OnboardingState } from './types';

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

      const resolvedHandle = (handle || handleInput).trim().toLowerCase();
      const redirectUrl = `/onboarding?handle=${encodeURIComponent(resolvedHandle)}`;

      if (
        state.isSubmitting ||
        Boolean(state.error) ||
        !handleValidation.clientValid ||
        handleValidation.checking ||
        !handleValidation.available ||
        !resolvedHandle
      ) {
        return;
      }

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
        const trimmedName = fullName.trim();
        if (!trimmedName) {
          throw new Error('[DISPLAY_NAME_REQUIRED] Display name is required');
        }
        await completeOnboarding({
          username: resolvedHandle,
          displayName: trimmedName,
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
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          setState(prev => ({ ...prev, step: 'complete', progress: 100 }));
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorCodeMatch =
          error instanceof Error ? error.message.match(/^\[([A-Z_]+)\]/) : null;
        const errorCode = errorCodeMatch?.[1];

        track('onboarding_error', {
          user_id: userId,
          handle: resolvedHandle,
          error_message: errorMessage,
          error_code: errorCode,
          error_step: 'submission',
          timestamp: new Date().toISOString(),
        });

        let userMessage = 'Could not save. Please try again.';
        const message = errorMessage.toUpperCase();
        if (message.includes('INVALID_SESSION')) {
          userMessage = 'Could not save. Please refresh and try again.';
        } else if (message.includes('USERNAME_TAKEN')) {
          userMessage = 'Not available. Try another handle.';
        } else if (message.includes('EMAIL_IN_USE')) {
          userMessage =
            'This email is already in use. Please sign in with the original account or use a different email.';
          router.push(
            `/signin?redirect_url=${encodeURIComponent(redirectUrl)}`
          );
          return;
        } else if (
          message.includes('RATE_LIMITED') ||
          message.includes('TOO_MANY_ATTEMPTS')
        ) {
          userMessage = 'Too many attempts. Please try again in a few moments.';
        } else if (
          message.includes('INVALID_USERNAME') ||
          message.includes('USERNAME_RESERVED') ||
          message.includes('USERNAME_INVALID_FORMAT') ||
          message.includes('USERNAME_TOO_SHORT') ||
          message.includes('USERNAME_TOO_LONG')
        ) {
          userMessage = "That handle can't be used. Try another one.";
        } else if (message.includes('DISPLAY_NAME_REQUIRED')) {
          userMessage = 'Please enter your name to continue.';
        }

        if (
          process.env.NODE_ENV === 'development' &&
          userMessage === 'Could not save. Please try again.' &&
          errorCode
        ) {
          userMessage = `Could not save (${errorCode}). Please try again.`;
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
      handleValidation.available,
      handleValidation.checking,
      handleValidation.clientValid,
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
