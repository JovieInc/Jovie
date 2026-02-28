'use client';

import { useRouter } from 'next/navigation';
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { connectSpotifyArtist } from '@/app/app/(shell)/dashboard/releases/actions';
import { completeOnboarding } from '@/app/onboarding/actions';
import {
  getOnboardingCompletionMethod,
  toDurationMs,
} from '@/components/dashboard/organisms/apple-style-onboarding/analytics';
import { identify, track } from '@/lib/analytics';
import {
  clearSignupClaimValue,
  readSignupClaimValue,
  SIGNUP_ARTIST_NAME_KEY,
  SIGNUP_SPOTIFY_EXPECTED_KEY,
  SIGNUP_SPOTIFY_URL_KEY,
} from '@/lib/auth/signup-claim-storage';
import { captureError } from '@/lib/error-tracking';
import {
  extractErrorCode,
  getErrorMessage,
  isDatabaseError,
  mapErrorToUserMessage,
} from './errors';
import {
  getSpotifyImportStageMessage,
  getSpotifyImportSuccessMessage,
} from './spotifyImportCopy';
import type { HandleValidationState, OnboardingState } from './types';
import { getResolvedHandle, validateDisplayName } from './validation';

interface SpotifyImportState {
  status: 'idle' | 'importing' | 'success' | 'error';
  stage: 0 | 1 | 2;
  message: string;
}

const SPOTIFY_STAGE_TRANSITION_DELAY_MS = 600;

async function waitForStageTransition(
  signal: AbortSignal,
  delayMs: number = SPOTIFY_STAGE_TRANSITION_DELAY_MS
): Promise<void> {
  await new Promise<void>(resolve => {
    const timeoutId = setTimeout(resolve, delayMs);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
  });
}

async function advanceSpotifyImportStages(
  safeSetter: (value: SetStateAction<SpotifyImportState>) => void,
  signal: AbortSignal,
  imported: number
): Promise<void> {
  safeSetter({
    status: 'importing',
    stage: 1,
    message: getSpotifyImportStageMessage(1, imported),
  });

  await waitForStageTransition(signal);
  if (signal.aborted) return;

  safeSetter({
    status: 'importing',
    stage: 2,
    message: getSpotifyImportStageMessage(2),
  });

  await waitForStageTransition(signal);
  if (signal.aborted) return;

  safeSetter({
    status: 'success',
    stage: 2,
    message: getSpotifyImportSuccessMessage(imported),
  });
}

async function tryAutoConnectSpotify(
  setSpotifyImportState: Dispatch<SetStateAction<SpotifyImportState>>,
  signal: AbortSignal,
  userId: string
): Promise<void> {
  const importStartedAt = Date.now();
  const safeSetter: typeof setSpotifyImportState = value => {
    if (!signal.aborted) setSpotifyImportState(value);
  };

  try {
    const spotifyExpected =
      readSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY) === 'true';
    const spotifyUrl = readSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY);

    if (!spotifyUrl && spotifyExpected) {
      track('onboarding_oauth_claim_missing', {
        missing_field: 'spotify_url',
        source: 'oauth_redirect',
      });
    }
    if (!spotifyUrl) {
      clearSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY);
      return;
    }

    const artistName = readSignupClaimValue(SIGNUP_ARTIST_NAME_KEY) ?? '';
    const artistMatch =
      /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/.exec(spotifyUrl);

    if (artistMatch?.[1]) {
      track('onboarding_spotify_import_started', {
        user_id: userId,
      });
      safeSetter({
        status: 'importing',
        stage: 0,
        message: getSpotifyImportStageMessage(0),
      });
      // Timer stays at stage 0 — stages 1+ use data-aware messages
      // that are only set after the API call resolves.
      const stageTimer = setInterval(() => {
        if (signal.aborted) {
          clearInterval(stageTimer);
        }
      }, 1200);

      // Clear interval on abort (component unmount)
      signal.addEventListener('abort', () => clearInterval(stageTimer), {
        once: true,
      });

      try {
        const normalizedUrl = `https://open.spotify.com/artist/${artistMatch[1]}`;
        const importResult = await connectSpotifyArtist({
          spotifyArtistId: artistMatch[1],
          spotifyArtistUrl: normalizedUrl,
          artistName,
        });

        // Clear timer immediately to prevent it from firing after completion
        clearInterval(stageTimer);

        if (importResult.success) {
          track('onboarding_spotify_import_completed', {
            user_id: userId,
            releasesImported: importResult.imported,
            duration: toDurationMs(importStartedAt),
          });
          await advanceSpotifyImportStages(
            safeSetter,
            signal,
            importResult.imported
          );
        } else {
          track('onboarding_spotify_import_failed', {
            user_id: userId,
            error: importResult.message || 'Spotify import failed',
            stage: 'connect',
          });
          safeSetter({
            status: 'error',
            stage: 2,
            message:
              importResult.message ||
              'Unable to connect Spotify. You can retry from your Dashboard.',
          });
        }
      } catch (error) {
        track('onboarding_spotify_import_failed', {
          user_id: userId,
          error: getErrorMessage(error),
          stage: 'connect',
        });
        safeSetter({
          status: 'error',
          stage: 2,
          message:
            'Spotify import is taking longer than expected. You can continue editing in Dashboard.',
        });
      } finally {
        clearInterval(stageTimer);
      }
    }
    clearSignupClaimValue(SIGNUP_SPOTIFY_URL_KEY);
    clearSignupClaimValue(SIGNUP_ARTIST_NAME_KEY);
    clearSignupClaimValue(SIGNUP_SPOTIFY_EXPECTED_KEY);
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
  shouldAutoSubmitHandle: boolean;
  isReservedHandle: boolean;
  onboardingStartedAtMs: number;
}

interface UseOnboardingSubmitReturn {
  state: OnboardingState;
  setState: Dispatch<SetStateAction<OnboardingState>>;
  handleSubmit: (e?: FormEvent) => Promise<void>;
  isPendingSubmit: boolean;
  spotifyImportState: SpotifyImportState;
  autoSubmitClaimed: boolean;
}

const AUTO_SUBMIT_CONFIRMATION_DELAY_MS = 1400;

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
  shouldAutoSubmitHandle,
  isReservedHandle,
  onboardingStartedAtMs,
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
  const [spotifyImportState, setSpotifyImportState] =
    useState<SpotifyImportState>({
      status: 'idle',
      stage: 0,
      message: '',
    });
  const [autoSubmitClaimed, setAutoSubmitClaimed] = useState(false);

  // Abort controller to clean up Spotify import interval on unmount
  const spotifyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      spotifyAbortRef.current?.abort();
    };
  }, []);

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
        setAutoSubmitClaimed(false);
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
      setAutoSubmitClaimed(false);
    },
    [router, userId]
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
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

      track('onboarding_handle_submitted', {
        user_id: userId,
        handle: resolvedHandle,
        wasReserved: isReservedHandle,
        wasAutoSubmitted: shouldAutoSubmitHandle,
      });

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
      setAutoSubmitClaimed(false);

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
          totalDuration: toDurationMs(onboardingStartedAtMs),
          method: getOnboardingCompletionMethod(shouldAutoSubmitHandle),
        });

        if (shouldAutoSubmitHandle) {
          setAutoSubmitClaimed(true);
          await new Promise(resolve => {
            globalThis.setTimeout(resolve, AUTO_SUBMIT_CONFIRMATION_DELAY_MS);
          });
          setAutoSubmitClaimed(false);
        }

        goToNextStep();

        // Auto-connect Spotify artist from homepage search and report staged progress
        spotifyAbortRef.current?.abort();
        const controller = new AbortController();
        spotifyAbortRef.current = controller;
        void tryAutoConnectSpotify(
          setSpotifyImportState,
          controller.signal,
          userId
        );
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
      shouldAutoSubmitHandle,
      isReservedHandle,
      onboardingStartedAtMs,
    ]
  );

  // Auto-submit for OAuth-derived handles once availability check settles.
  useEffect(() => {
    if (
      !shouldAutoSubmitHandle ||
      state.isSubmitting ||
      isPendingSubmit ||
      Boolean(state.error)
    ) {
      return;
    }

    if (!handleInput || handleValidation.checking) {
      return;
    }

    if (handleValidation.clientValid && handleValidation.available) {
      setIsPendingSubmit(true);
    }
  }, [
    handleInput,
    handleValidation.available,
    handleValidation.checking,
    handleValidation.clientValid,
    isPendingSubmit,
    shouldAutoSubmitHandle,
    state.error,
    state.isSubmitting,
  ]);

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
    spotifyImportState,
    autoSubmitClaimed,
  };
}
