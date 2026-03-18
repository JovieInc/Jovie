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
  type EnrichedProfileData,
  enrichProfileFromDsp,
} from '@/app/onboarding/actions/enrich-profile';
import {
  getOnboardingCompletionMethod,
  toDurationMs,
} from '@/features/dashboard/organisms/apple-style-onboarding/analytics';
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
import type { HandleValidationState, OnboardingState } from './types';
import { getResolvedHandle, validateDisplayName } from './validation';

interface SpotifyImportState {
  status: 'idle' | 'importing' | 'success' | 'error';
  stage: 0 | 1 | 2;
  message: string;
}

/**
 * JOV-1340: Auto-connect Spotify from homepage search claim data.
 * Now fully non-blocking — fires connect + enrichment in background,
 * does NOT block step transitions or show staged spinners.
 */
function tryAutoConnectSpotify(
  setSpotifyImportState: Dispatch<SetStateAction<SpotifyImportState>>,
  setEnrichedProfile: Dispatch<SetStateAction<EnrichedProfileData | null>>,
  setIsEnriching: Dispatch<SetStateAction<boolean>>,
  setIsConnecting: Dispatch<SetStateAction<boolean>>,
  signal: AbortSignal,
  userId: string
): void {
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
      const artistId = artistMatch[1];
      const normalizedUrl = `https://open.spotify.com/artist/${artistId}`;

      track('onboarding_spotify_import_started', { user_id: userId });

      // Set import state to success immediately — actual import is background
      if (!signal.aborted) {
        setSpotifyImportState({
          status: 'success',
          stage: 2,
          message: 'Your music is being imported in the background.',
        });
      }

      // Connect Spotify artist in background — tracked so dashboard redirect
      // waits for the DB write to complete (fixes empty sidebar/DSPs).
      if (!signal.aborted) setIsConnecting(true);
      void connectSpotifyArtist({
        spotifyArtistId: artistId,
        spotifyArtistUrl: normalizedUrl,
        artistName,
        includeTracks: false,
      })
        .then(result => {
          if (result.success) {
            track('onboarding_spotify_import_completed', {
              user_id: userId,
              releasesImported: result.importing ? 0 : result.imported,
            });
          }
        })
        .catch(() => {
          // Import failure is non-critical during onboarding
        })
        .finally(() => {
          if (!signal.aborted) setIsConnecting(false);
        });

      // Fire-and-forget: enrich profile data in background
      if (!signal.aborted) setIsEnriching(true);
      void enrichProfileFromDsp(artistId, normalizedUrl)
        .then(enriched => {
          if (!signal.aborted) {
            setEnrichedProfile(enriched);
          }
        })
        .catch(() => {
          // Enrichment failure is non-critical — user can fill in manually
        })
        .finally(() => {
          if (!signal.aborted) setIsEnriching(false);
        });
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
  enrichedProfile: EnrichedProfileData | null;
  setEnrichedProfile: Dispatch<SetStateAction<EnrichedProfileData | null>>;
  isEnriching: boolean;
  isConnecting: boolean;
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
  const [enrichedProfile, setEnrichedProfile] =
    useState<EnrichedProfileData | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Abort controller to clean up Spotify import on unmount
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
        // Use fullName if provided (from Clerk identity), otherwise fall back to handle.
        // Display name == handle is allowed here — it will be enforced on the profile
        // review step where the user can edit it inline.
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

        // Auto-connect Spotify artist from homepage search (JOV-1340: non-blocking)
        spotifyAbortRef.current?.abort();
        const controller = new AbortController();
        spotifyAbortRef.current = controller;
        tryAutoConnectSpotify(
          setSpotifyImportState,
          setEnrichedProfile,
          setIsEnriching,
          setIsConnecting,
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
    enrichedProfile,
    setEnrichedProfile,
    isEnriching,
    isConnecting,
  };
}
