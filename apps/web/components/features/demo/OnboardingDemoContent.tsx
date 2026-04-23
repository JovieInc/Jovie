'use client';

import { type FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { OnboardingDspStep } from '@/features/dashboard/organisms/onboarding/OnboardingDspStep';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';
import { OnboardingProfileReviewStep } from '@/features/dashboard/organisms/onboarding/OnboardingProfileReviewStep';
import { cn } from '@/lib/utils';
import {
  DEMO_ENRICHED_PROFILE,
  DEMO_HANDLE_VALIDATION,
} from './demo-surface-fixtures';

const DEMO_ONBOARDING_STEPS = ['handle', 'dsp', 'profile-review'] as const;

export type DemoOnboardingStepId = (typeof DEMO_ONBOARDING_STEPS)[number];

// Labels mirror the canonical sidebar labels used by OnboardingV2Form
// (Handle / Spotify / Finish). The demo exposes a condensed 3-step slice,
// but the labels should match the real flow so the demo reads as a faithful
// preview of real onboarding.
const STEP_LABELS: Record<DemoOnboardingStepId, string> = {
  handle: 'Handle',
  dsp: 'Spotify',
  'profile-review': 'Finish',
};

function getStepIndicatorClassName(index: number, currentIndex: number) {
  if (index === currentIndex) {
    return 'w-6 bg-primary-token';
  }

  if (index < currentIndex) {
    return 'w-1.5 bg-primary-token/40';
  }

  return 'w-1.5 bg-primary-token/15';
}

interface OnboardingDemoContentProps {
  readonly currentStep: DemoOnboardingStepId;
  readonly onStepChange: (step: DemoOnboardingStepId) => void;
  readonly isRevealing: boolean;
  readonly onFinish: () => void;
}

function StepSwitcher({
  currentStep,
  onStepChange,
}: Readonly<{
  currentStep: DemoOnboardingStepId;
  onStepChange: (step: DemoOnboardingStepId) => void;
}>) {
  return (
    <div className='flex items-center gap-1 overflow-x-auto px-1 py-1'>
      {DEMO_ONBOARDING_STEPS.map(step => (
        <button
          key={step}
          type='button'
          onClick={() => onStepChange(step)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            currentStep === step
              ? 'bg-accent-token text-white'
              : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
          )}
        >
          {STEP_LABELS[step]}
        </button>
      ))}
    </div>
  );
}

export function OnboardingDemoContent({
  currentStep,
  onStepChange,
  isRevealing,
  onFinish,
}: Readonly<OnboardingDemoContentProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [handleInput, setHandleInput] = useState('soravale');
  const currentIndex = DEMO_ONBOARDING_STEPS.indexOf(currentStep);

  const footer = useMemo(
    () => (
      <div className='flex items-center justify-center gap-2 pt-1'>
        {DEMO_ONBOARDING_STEPS.map((step, index) => (
          <button
            key={step}
            type='button'
            onClick={() => onStepChange(step)}
            aria-label={`Step ${index + 1}`}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              getStepIndicatorClassName(index, currentIndex)
            )}
          />
        ))}
      </div>
    ),
    [currentIndex, onStepChange]
  );

  const handleStepSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      onStepChange('dsp');
    },
    [onStepChange]
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'handle':
        return (
          <OnboardingHandleStep
            title='Claim your link'
            prompt='This is the only link you need to share your music. Make it yours.'
            handleInput={handleInput}
            isHydrated
            handleValidation={DEMO_HANDLE_VALIDATION}
            stateError={null}
            isSubmitting={false}
            isTransitioning={false}
            ctaDisabledReason={null}
            inputRef={inputRef}
            onHandleChange={setHandleInput}
            onSubmit={handleStepSubmit}
            onSuggestionClick={setHandleInput}
          />
        );
      case 'dsp':
        return (
          <OnboardingDspStep
            title='Are you on Spotify?'
            prompt='Connect Spotify so we can pull in your releases, artwork, and DSP links automatically.'
            onConnected={() => onStepChange('profile-review')}
            onSkip={() => onStepChange('profile-review')}
            isTransitioning={false}
          />
        );
      case 'profile-review':
        return (
          <OnboardingProfileReviewStep
            title='Your link is live'
            prompt='Review your profile. You can polish anything later from the dashboard.'
            enrichedProfile={DEMO_ENRICHED_PROFILE}
            handle={handleInput}
            onGoToDashboard={onFinish}
            isEnriching={false}
            existingAvatarUrl={DEMO_ENRICHED_PROFILE.imageUrl}
            existingBio={DEMO_ENRICHED_PROFILE.bio}
            existingGenres={DEMO_ENRICHED_PROFILE.genres}
            isStepResume
          />
        );
    }
  };

  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight={currentStep === 'handle' ? 'tall' : 'default'}
      topBar={
        <StepSwitcher currentStep={currentStep} onStepChange={onStepChange} />
      }
      footer={footer}
      data-testid='demo-onboarding-experience-shell'
      className={cn(
        'transition-opacity duration-700 ease-out',
        isRevealing ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      {renderCurrentStep()}
    </OnboardingExperienceShell>
  );
}
