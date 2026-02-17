'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSpotifyArtist } from '@/app/app/(shell)/dashboard/releases/actions';
import { completeOnboarding } from '@/app/onboarding/actions';
import { identify, track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  extractErrorCode,
  getErrorMessage,
  isDatabaseError,
  mapErrorToUserMessage,
} from './errors';
import type { HandleValidationState, OnboardingState } from './types';
import { getResolvedHandle, validateDisplayName } from './validation';

function tryAutoConnectSpotify(): void {
  try {
    const spotifyUrl = sessionStorage.getItem('jovie_signup_spotify_url');
    if (!spotifyUrl) return;

    const artistName = sessionStorage.getItem('jovie_signup_artist_name') ?? '';
    const artistMatch =
      /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/.exec(spotifyUrl);

    if (artistMatch?.[1]) {
      const normalizedUrl = `https://open.spotify.com/artist/${artistMatch[1]}`;
      connectSpotifyArtist({
        spotifyArtistId: artistMatch[1],
        spotifyArtistUrl: normalizedUrl,
        artistName,
      }).catch(() => {});
    }
    sessionStorage.removeItem('jovie_signup_spotify_url');
    sessionStorage.removeItem('jovie_signup_artist_name');
  } catch {
    // sessionStorage access may fail — non-critical
  }
}

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
  isPendingSubmit: boolean;
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
  const [isPendingSubmit, setIsPendingSubmit] = useState(false);

  // Refs to track current state values without causing callback recreation
  const isSubmittingRef = useRef(state.isSubmitting);
  const errorRef = useRef(state.error);

  // Keep refs in sync with state
  useEffect(() => {
    isSubmittingRef.current = state.isSubmitting;
  }, [state.isSubmitting]);

  useEffect(() => {
    errorRef.current = state.error;
  }, [state.error]);

  const handleSubmitError = useCallback(
    (error: unknown, resolvedHandle: string, redirectUrl: string) => {
      const errMsg = getErrorMessage(error);

      // Handle Next.js redirect special case
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
      void captureError('Onboarding submission failed', error, {
        userId,
        handle: resolvedHandle,
        errorCode,
        step: 'submission',
        route: '/onboarding',
      });

      const errorTrackingPayload = {
        user_id: userId,
        handle: resolvedHandle,
        error_message: errMsg,
        error_code: isDatabaseError(error) ? 'DATABASE_ERROR' : errorCode,
        error_step: 'submission',
        timestamp: new Date().toISOString(),
      };
      track('onboarding_error', errorTrackingPayload);

      if (isDatabaseError(error)) {
        setState(prev => ({
          ...prev,
          error:
            "We couldn't finish setting up your account. Please try again in a moment.",
          step: 'validating',
          progress: 0,
          isSubmitting: false,
        }));
        return;
      }

      const { userMessage, shouldRedirectToSignIn } = mapErrorToUserMessage(
        error,
        redirectUrl
      );

      if (shouldRedirectToSignIn) {
        router.push(`/signin?redirect_url=${encodeURIComponent(redirectUrl)}`);
        return;
      }

      setState(prev => ({
        ...prev,
        error: userMessage,
        step: 'validating',
        progress: 0,
        isSubmitting: false,
      }));
    },
    [router, userId]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();

      const resolvedHandle = getResolvedHandle(handle, handleInput);
      const redirectUrl = `/onboarding?handle=${encodeURIComponent(resolvedHandle)}`;

      // If already submitting, don't allow another submission
      if (isSubmittingRef.current) {
        return;
      }

      // If validation is currently checking, set pending flag and return
      // The useEffect below will auto-submit when validation completes
      if (handleValidation.checking) {
        setIsPendingSubmit(true);
        return;
      }

      // Clear pending flag since we're proceeding with submission
      setIsPendingSubmit(false);

      // Check remaining validation requirements (excluding checking state)
      if (!resolvedHandle) return;
      if (errorRef.current) return;
      if (!handleValidation.clientValid) return;
      if (!handleValidation.available) return;

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
        // Use fullName if provided (from Clerk identity), otherwise fall back to handle
        const resolvedDisplayName = fullName.trim() || resolvedHandle;
        validateDisplayName(resolvedDisplayName);
        await completeOnboarding({
          username: resolvedHandle,
          displayName: resolvedDisplayName,
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

        // Auto-connect Spotify artist from homepage search (fire-and-forget)
        tryAutoConnectSpotify();

        goToNextStep();
      } catch (error) {
        handleSubmitError(error, resolvedHandle, redirectUrl);
      }
    },
    [
      fullName,
      goToNextStep,
      handle,
      handleInput,
      handleSubmitError,
      handleValidation,
      setProfileReadyHandle,
      userEmail,
      userId,
    ]
  );

  // Auto-submit when validation completes if user had pending submit intent
  useEffect(() => {
    if (
      isPendingSubmit &&
      !handleValidation.checking &&
      handleValidation.available &&
      handleValidation.clientValid &&
      !state.isSubmitting
    ) {
      setIsPendingSubmit(false);
      // Fire-and-forget: errors are handled within handleSubmit
      handleSubmit().catch(() => {});
    }
  }, [
    isPendingSubmit,
    handleValidation.checking,
    handleValidation.available,
    handleValidation.clientValid,
    state.isSubmitting,
    handleSubmit,
  ]);

  return {
    state,
    setState,
    handleSubmit,
    isPendingSubmit,
  };
}
