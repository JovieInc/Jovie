'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding';
import { useHandleValidation } from './onboarding-v2/shared/useHandleValidation';
import { useOnboardingSubmit } from './onboarding-v2/shared/useOnboardingSubmit';

interface OnboardingHandleOnlyFormProps {
  readonly assumeInitialHandleAvailable?: boolean;
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly isHydrated: boolean;
  readonly isReservedHandle?: boolean;
  readonly shouldAutoSubmitHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly designV1?: boolean;
}

const SIDEBAR_STEPS = [
  { id: 'handle', label: 'Handle' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'upgrade', label: 'Plan' },
  { id: 'dsp', label: 'DSPs' },
  { id: 'social', label: 'Social' },
  { id: 'releases', label: 'Releases' },
  { id: 'profile-ready', label: 'Finish' },
] as const;

function HandleSidebar() {
  return (
    <nav aria-label='Onboarding steps'>
      <ul className='space-y-1.5'>
        {SIDEBAR_STEPS.map(step => (
          <li key={step.id}>
            <div className='flex items-center gap-3 rounded-xl px-2 py-2'>
              <div
                className={
                  step.id === 'handle'
                    ? 'h-4 w-4 shrink-0 rounded-full border border-primary-token bg-primary-token'
                    : 'h-4 w-4 shrink-0 rounded-full border border-(--linear-app-frame-seam) bg-transparent'
                }
              />
              <span
                className={
                  step.id === 'handle'
                    ? 'text-sm font-semibold text-primary-token'
                    : 'text-sm text-secondary-token'
                }
              >
                {step.label}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function OnboardingHandleOnlyForm({
  assumeInitialHandleAvailable = false,
  initialDisplayName = '',
  initialHandle = '',
  isHydrated,
  isReservedHandle = false,
  shouldAutoSubmitHandle = false,
  userEmail = null,
  userId,
  designV1 = false,
}: Readonly<OnboardingHandleOnlyFormProps>) {
  const router = useRouter();
  const onboardingStartedAtRef = useRef(Date.now());
  const handleInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const [handleInput, setHandleInput] = useState(normalizedInitialHandle);
  const [fullName] = useState(initialDisplayName);
  const nextHandleRef = useRef(normalizedInitialHandle);

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      assumeInitialHandleAvailable,
      normalizedInitialHandle,
      fullName,
    });
  const validateHandleRef = useRef(validateHandle);

  const setProfileReadyHandle = useCallback((nextHandle: string) => {
    nextHandleRef.current = nextHandle;
  }, []);

  const goToNextStep = useCallback(() => {
    const nextHandle = nextHandleRef.current || handleInput || initialHandle;
    const query = new URLSearchParams({
      handle: nextHandle,
      resume: 'spotify',
    });
    router.replace(`${APP_ROUTES.ONBOARDING}?${query.toString()}`, {
      scroll: false,
    });
  }, [handleInput, initialHandle, router]);

  const { autoSubmitClaimed, handleSubmit, isPendingSubmit, state } =
    useOnboardingSubmit({
      fullName,
      goToNextStep,
      handle,
      handleInput,
      handleValidation,
      isHydrated,
      isReservedHandle,
      onboardingStartedAtMs: onboardingStartedAtRef.current,
      setProfileReadyHandle,
      shouldAutoSubmitHandle,
      userEmail,
      userId,
    });

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

    validateHandleRef.current(handleInput);
  }, [handleInput, setHandleValidation]);

  useEffect(() => {
    handleInputRef.current?.focus();
  }, []);

  const handleStepCtaDisabledReason = useMemo(() => {
    if (!handleInput) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability...';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleInput, handleValidation]);

  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight='tall'
      sidebar={<HandleSidebar />}
      sidebarTitle='Jovie Setup'
      stageVariant='flat'
      visualVariant={designV1 ? 'v1' : 'default'}
      data-testid='onboarding-experience-shell'
    >
      <OnboardingHandleStep
        autoSubmitClaimed={autoSubmitClaimed}
        ctaDisabledReason={handleStepCtaDisabledReason}
        handleInput={handleInput}
        handleValidation={handleValidation}
        inputRef={handleInputRef}
        isHydrated={isHydrated}
        isPendingSubmit={isPendingSubmit}
        isReservedHandle={isReservedHandle}
        isSubmitting={state.isSubmitting}
        isTransitioning={false}
        onHandleChange={setHandleInput}
        onSubmit={handleSubmit}
        stateError={state.error}
        title='Choose your handle'
        prompt='This is the username fans will use to find you.'
      />
    </OnboardingExperienceShell>
  );
}
