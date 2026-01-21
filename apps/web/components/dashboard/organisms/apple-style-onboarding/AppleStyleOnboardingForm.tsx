'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthBackButton } from '@/components/auth';
import {
  OnboardingCompleteStep,
  OnboardingHandleStep,
  OnboardingNameStep,
} from '@/components/dashboard/organisms/onboarding';
import { PROFILE_HOSTNAME, PROFILE_URL } from '@/constants/domains';
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
  skipNameStep = false,
}: Readonly<AppleStyleOnboardingFormProps>) {
  const PRODUCTION_PROFILE_DOMAIN = PROFILE_HOSTNAME;
  const PRODUCTION_PROFILE_BASE_URL = PROFILE_URL;

  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName, setFullName] = useState(initialDisplayName);
  const [profileReadyHandle, setProfileReadyHandle] = useState(
    normalizedInitialHandle
  );
  const { copy, isSuccess: copied } = useClipboard({ resetDelay: 2000 });

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const handleInputRef = useRef<HTMLInputElement | null>(null);

  const displayDomain = PRODUCTION_PROFILE_DOMAIN;

  const { currentStepIndex, isTransitioning, goToNextStep, goBack } =
    useStepNavigation({ skipNameStep });

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

  const namePlaceholder = useMemo(() => {
    const options = [
      'Madonna',
      'BLACKPINK',
      'Tiësto',
      'FISHER',
      'Neon Hitch',
      'U2',
      'Imagine Dragons',
      'ODESZA',
    ];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  const isDisplayNameValid = useMemo(() => {
    const trimmed = fullName.trim();
    return trimmed.length > 0 && trimmed.length <= 50;
  }, [fullName]);

  useEffect(() => {
    if (userId) {
      track('onboarding_started', {
        user_id: userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [userId]);

  useEffect(() => {
    const target =
      currentStepIndex === 0 ? nameInputRef.current : handleInputRef.current;
    if (target) {
      target.focus();
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

    const timer = setTimeout(() => {
      void validateHandle(handleInput);
    }, 400);

    return () => {
      clearTimeout(timer);
    };
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
    window.location.href = '/app/dashboard';
  }, []);

  const renderStepContent = () => {
    switch (currentStepIndex) {
      case 0:
        return (
          <OnboardingNameStep
            title={ONBOARDING_STEPS[0].title}
            prompt={ONBOARDING_STEPS[0].prompt}
            fullName={fullName}
            namePlaceholder={namePlaceholder}
            isValid={isDisplayNameValid}
            isTransitioning={isTransitioning}
            isSubmitting={state.isSubmitting}
            inputRef={nameInputRef}
            onNameChange={setFullName}
            onSubmit={goToNextStep}
          />
        );

      case 1:
        return (
          <OnboardingHandleStep
            title={ONBOARDING_STEPS[1].title}
            prompt={ONBOARDING_STEPS[1].prompt}
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

      case 2:
        return (
          <OnboardingCompleteStep
            title={ONBOARDING_STEPS[2].title}
            prompt={ONBOARDING_STEPS[2].prompt}
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
