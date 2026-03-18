'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enrichProfileFromDsp } from '@/app/onboarding/actions/enrich-profile';
import { APP_ROUTES } from '@/constants/routes';
import { AuthBackButton } from '@/features/auth';
import { ProfileLiveCelebration } from '@/features/dashboard/molecules/ProfileLiveCelebration';
import { getValidationFailureKey } from '@/features/dashboard/organisms/apple-style-onboarding/analytics';
import {
  OnboardingDspStep,
  OnboardingHandleStep,
  OnboardingProfileReviewStep,
} from '@/features/dashboard/organisms/onboarding';
import { track } from '@/lib/analytics';
import {
  clearPlanIntent,
  getPlanIntent,
  isPaidIntent,
} from '@/lib/auth/plan-intent';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { getOnboardingDashboardInitialQuery } from './onboardingDashboardQuery';

import type { AppleStyleOnboardingFormProps } from './types';
import { ONBOARDING_STEPS } from './types';
import { useHandleValidation } from './useHandleValidation';
import { useOnboardingSubmit } from './useOnboardingSubmit';
import { useStepNavigation } from './useStepNavigation';

export function AppleStyleOnboardingForm({
  initialDisplayName = '',
  initialHandle = '',
  isReservedHandle = false,
  userEmail = null,
  userId,
  shouldAutoSubmitHandle = false,
  initialStepIndex = 0,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
}: Readonly<AppleStyleOnboardingFormProps>) {
  const onboardingStartedAtRef = useRef(Date.now());
  const previousStepIndexRef = useRef<number | null>(null);
  const lastValidationFailureKeyRef = useRef<string | null>(null);

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName] = useState(initialDisplayName);
  const [profileReadyHandle, setProfileReadyHandle] = useState(
    normalizedInitialHandle
  );
  const [isClientReady, setIsClientReady] = useState(false);
  const handleInputRef = useRef<HTMLInputElement | null>(null);

  const { currentStepIndex, isTransitioning, goToNextStep, goBack } =
    useStepNavigation(initialStepIndex);

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      normalizedInitialHandle,
      fullName,
    });
  const validateHandleRef = useRef(validateHandle);

  const [isDspEnriching, setIsDspEnriching] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const checkoutStepEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.ONBOARDING_CHECKOUT_STEP
  );

  const {
    state,
    handleSubmit,
    isPendingSubmit,
    spotifyImportState,
    autoSubmitClaimed,
    enrichedProfile,
    setEnrichedProfile,
    isEnriching: isAutoConnectEnriching,
    isConnecting,
  } = useOnboardingSubmit({
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
    onboardingStartedAtMs: onboardingStartedAtRef.current,
  });

  useEffect(() => {
    if (userId) {
      track('onboarding_started', {
        user_id: userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [userId]);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    const currentStep = ONBOARDING_STEPS[currentStepIndex];
    const previousStepIndex = previousStepIndexRef.current;
    const previousStep =
      previousStepIndex === null ? null : ONBOARDING_STEPS[previousStepIndex];

    if (currentStep) {
      track('onboarding_step_transitioned', {
        user_id: userId,
        fromStep: previousStep?.id ?? null,
        toStep: currentStep.id,
        stepIndex: currentStepIndex,
      });
    }

    previousStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex, userId]);

  const handleSuggestionClick = useCallback(
    (selectedSuggestion: string) => {
      track('onboarding_handle_suggestion_selected', {
        user_id: userId,
        originalHandle: handleInput,
        selectedSuggestion,
      });
      setHandleInput(selectedSuggestion);
    },
    [handleInput, userId]
  );

  useEffect(() => {
    if (currentStepIndex === 0 && handleInputRef.current) {
      handleInputRef.current.focus();
    }
  }, [currentStepIndex]);

  useEffect(() => {
    if (!handleInput || handleValidation.checking || !handleValidation.error) {
      lastValidationFailureKeyRef.current = null;
      return;
    }

    const failureKey = getValidationFailureKey(
      handleInput,
      handleValidation.error
    );
    if (lastValidationFailureKeyRef.current === failureKey) {
      return;
    }

    track('onboarding_handle_validation_failed', {
      user_id: userId,
      handle: handleInput,
      reason: handleValidation.error,
    });
    lastValidationFailureKeyRef.current = failureKey;
  }, [handleInput, handleValidation.checking, handleValidation.error, userId]);

  const handleStepCtaDisabledReason = useMemo(() => {
    if (state.isSubmitting) return 'Saving...';
    if (state.error) return state.error;
    if (!handleInput) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability...';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleInput, handleValidation, state.error, state.isSubmitting]);

  // Trigger handle validation when input changes
  // Pacer hook handles debouncing (400ms) and caching internally
  useEffect(() => {
    validateHandleRef.current = validateHandle;
  }, [validateHandle]);

  useEffect(() => {
    if (!handleInput) {
      setHandleValidation({
        available: false,
        checking: false,
        error: null,
        clientValid: false,
        suggestions: [],
      });
      return;
    }

    // Call validateHandle directly - Pacer handles debouncing
    validateHandleRef.current(handleInput);
  }, [handleInput, setHandleValidation]);

  const navigateAfterOnboarding = useCallback(() => {
    if (globalThis.window === undefined) return;

    if (process.env.NEXT_PUBLIC_E2E_MODE === '1') {
      globalThis.location.href = APP_ROUTES.DASHBOARD;
      return;
    }

    // If user expressed paid intent and checkout step is enabled, go to checkout
    const planIntent = getPlanIntent();
    if (checkoutStepEnabled && isPaidIntent(planIntent)) {
      globalThis.location.href = `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=${planIntent}`;
      return;
    }

    // Free flow: clear any stale intent and go to dashboard
    clearPlanIntent();
    const initialQuery = getOnboardingDashboardInitialQuery(
      spotifyImportState.status
    );
    const dashboardUrl = `${APP_ROUTES.DASHBOARD}?q=${encodeURIComponent(initialQuery)}`;

    globalThis.location.href = dashboardUrl;
  }, [spotifyImportState.status, checkoutStepEnabled]);

  const goToDashboard = useCallback(() => {
    if (process.env.NEXT_PUBLIC_E2E_MODE === '1') {
      navigateAfterOnboarding();
      return;
    }

    // Show celebration first, then navigate
    setShowCelebration(true);
  }, [navigateAfterOnboarding]);

  /**
   * JOV-1340: DSP connection handler is now non-blocking.
   * Enrichment runs in the background; user proceeds immediately.
   */
  const handleDspConnected = useCallback(
    (
      _releases: unknown,
      artistName: string,
      spotifyArtistId?: string,
      spotifyUrl?: string
    ) => {
      track('onboarding_dsp_connected', {
        user_id: userId,
        artist_name: artistName,
      });

      // Fire-and-forget: enrich profile in background (JOV-1340)
      if (spotifyArtistId && spotifyUrl) {
        setIsDspEnriching(true);
        void enrichProfileFromDsp(spotifyArtistId, spotifyUrl)
          .then(enriched => setEnrichedProfile(enriched))
          .catch(() => {
            // Enrichment failure is non-critical — user can fill in manually
          })
          .finally(() => setIsDspEnriching(false));
      }

      goToNextStep();
    },
    [goToNextStep, userId, setEnrichedProfile]
  );

  const handleDspSkip = useCallback(() => {
    track('onboarding_dsp_skipped', { user_id: userId });
    goToNextStep();
  }, [goToNextStep, userId]);

  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <OnboardingHandleStep
            title={ONBOARDING_STEPS[0].title}
            prompt={ONBOARDING_STEPS[0].prompt}
            handleInput={handleInput}
            isReservedHandle={isReservedHandle}
            handleValidation={handleValidation}
            stateError={state.error}
            isSubmitting={state.isSubmitting}
            isTransitioning={isTransitioning}
            ctaDisabledReason={handleStepCtaDisabledReason}
            inputRef={handleInputRef}
            onHandleChange={setHandleInput}
            onSubmit={handleSubmit}
            onSuggestionClick={handleSuggestionClick}
            isPendingSubmit={isPendingSubmit}
            autoSubmitClaimed={autoSubmitClaimed}
          />
        );

      case 1:
        return (
          <OnboardingDspStep
            title={ONBOARDING_STEPS[1].title}
            prompt={ONBOARDING_STEPS[1].prompt}
            onConnected={handleDspConnected}
            onSkip={handleDspSkip}
            isTransitioning={isTransitioning}
          />
        );

      case 2:
        return (
          <OnboardingProfileReviewStep
            title={ONBOARDING_STEPS[2].title}
            prompt={ONBOARDING_STEPS[2].prompt}
            enrichedProfile={enrichedProfile}
            handle={profileReadyHandle || handle}
            onGoToDashboard={goToDashboard}
            isEnriching={
              isDspEnriching || isAutoConnectEnriching || isConnecting
            }
            existingAvatarUrl={existingAvatarUrl}
            existingBio={existingBio}
            existingGenres={existingGenres}
            isStepResume={initialStepIndex > 0}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className='w-full flex flex-col items-center justify-center bg-(--bg) text-(--fg) gap-6'>
      {showCelebration && (
        <ProfileLiveCelebration
          username={profileReadyHandle || handle}
          onComplete={navigateAfterOnboarding}
        />
      )}
      <div aria-hidden={showCelebration} inert={showCelebration}>
        <AuthBackButton onClick={goBack} ariaLabel='Go back' />

        <Link
          href='#main-content'
          className='sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 px-4 py-2 rounded-md z-50 btn btn-primary btn-sm'
        >
          Skip to main content
        </Link>

        <div className='sr-only' aria-live='polite' aria-atomic='true'>
          Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}:{' '}
          {ONBOARDING_STEPS[currentStepIndex]?.title}
        </div>

        <main
          className='w-full max-w-3xl flex items-center justify-center px-4 pb-8'
          id='main-content'
          aria-labelledby='step-heading'
        >
          <div id='step-heading' className='sr-only'>
            {ONBOARDING_STEPS[currentStepIndex]?.title} step content
          </div>
          <div
            key={currentStepIndex}
            data-onboarding-client-ready={isClientReady ? 'true' : 'false'}
            className={`w-full max-w-2xl transform transition-all duration-500 ease-in-out ${
              isTransitioning
                ? 'opacity-0 translate-y-4'
                : 'opacity-100 translate-y-0'
            }`}
          >
            {renderStepContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
