'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthBackButton } from '@/components/auth';
import {
  OnboardingCompleteStep,
  OnboardingHandleStep,
} from '@/components/dashboard/organisms/onboarding';
import { BASE_URL, HOSTNAME } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { useClipboard } from '@/hooks/useClipboard';
import { track } from '@/lib/analytics';
import type { AppleStyleOnboardingFormProps } from './types';
import { ONBOARDING_STEPS } from './types';
import { useHandleValidation } from './useHandleValidation';
import { useOnboardingSubmit } from './useOnboardingSubmit';
import { useStepNavigation } from './useStepNavigation';

export function AppleStyleOnboardingForm({
  initialDisplayName = '',
  initialHandle = '',
  userEmail = null,
  userId,
}: Readonly<AppleStyleOnboardingFormProps>) {
  const PRODUCTION_PROFILE_DOMAIN = HOSTNAME;
  const PRODUCTION_PROFILE_BASE_URL = BASE_URL;

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName] = useState(initialDisplayName);
  const [profileReadyHandle, setProfileReadyHandle] = useState(
    normalizedInitialHandle
  );
  const { copy, isSuccess: copied } = useClipboard({ resetDelay: 2000 });

  const handleInputRef = useRef<HTMLInputElement | null>(null);

  const displayDomain = PRODUCTION_PROFILE_DOMAIN;

  const { currentStepIndex, isTransitioning, goToNextStep, goBack } =
    useStepNavigation();

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      normalizedInitialHandle,
      fullName,
    });

  const { state, handleSubmit, isPendingSubmit } = useOnboardingSubmit({
    userId,
    userEmail,
    fullName,
    handle,
    handleInput,
    handleValidation,
    goToNextStep,
    setProfileReadyHandle,
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
    if (currentStepIndex === 0 && handleInputRef.current) {
      handleInputRef.current.focus();
    }
  }, [currentStepIndex]);

  const handleStepCtaDisabledReason = useMemo(() => {
    if (state.isSubmitting) return 'Saving…';
    if (state.error) return state.error;
    if (!handleInput) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability…';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleInput, handleValidation, state.error, state.isSubmitting]);

  // Trigger handle validation when input changes
  // Pacer hook handles debouncing (400ms) and caching internally
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
    validateHandle(handleInput);
  }, [handleInput, setHandleValidation, validateHandle]);

  const copyProfileLink = useCallback(() => {
    const targetHandle = profileReadyHandle || handle || handleInput;
    const link = `${PRODUCTION_PROFILE_BASE_URL}/${targetHandle}`;
    void copy(link);
  }, [
    PRODUCTION_PROFILE_BASE_URL,
    copy,
    handle,
    handleInput,
    profileReadyHandle,
  ]);

  const goToDashboard = useCallback(() => {
    globalThis.location.href = APP_ROUTES.DASHBOARD;
  }, []);

  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <OnboardingHandleStep
            title={ONBOARDING_STEPS[0].title}
            prompt={ONBOARDING_STEPS[0].prompt}
            handleInput={handleInput}
            handleValidation={handleValidation}
            stateError={state.error}
            isSubmitting={state.isSubmitting}
            isTransitioning={isTransitioning}
            ctaDisabledReason={handleStepCtaDisabledReason}
            inputRef={handleInputRef}
            onHandleChange={setHandleInput}
            onSubmit={handleSubmit}
            isPendingSubmit={isPendingSubmit}
          />
        );

      case 1:
        return (
          <OnboardingCompleteStep
            title={ONBOARDING_STEPS[1].title}
            prompt={ONBOARDING_STEPS[1].prompt}
            displayDomain={displayDomain}
            handle={profileReadyHandle || handle}
            copied={copied}
            onGoToDashboard={goToDashboard}
            onCopyLink={copyProfileLink}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className='w-full flex flex-col items-center justify-center bg-(--bg) text-(--fg) gap-6'>
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
  );
}
