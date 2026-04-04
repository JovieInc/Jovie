'use client';

import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { cn } from '@/lib/utils';
import { OnboardingDemoProfilePanel } from './OnboardingDemoProfilePanel';
import {
  ALL_STEPS,
  OnboardingDemoStep,
  type StepId,
} from './OnboardingDemoSteps';

const STEP_LABELS: Record<StepId, string> = {
  handle: 'Handle',
  spotify: 'Spotify',
  'artist-confirm': 'Confirm',
  upgrade: 'Upgrade',
  dsp: 'DSPs',
  social: 'Social',
  releases: 'Releases',
  'late-arrivals': 'Late',
  'profile-ready': 'Ready',
};

function getDotClass(index: number, currentIndex: number): string {
  if (index === currentIndex) return 'w-6 bg-primary-token';
  if (index < currentIndex) return 'w-1.5 bg-primary-token/40';
  return 'w-1.5 bg-primary-token/15';
}

interface OnboardingDemoContentProps {
  readonly currentStep: StepId;
  readonly onStepChange: (step: StepId) => void;
  readonly isRevealing: boolean;
  readonly onFinish: () => void;
}

export function OnboardingDemoContent({
  currentStep,
  onStepChange,
  isRevealing,
  onFinish,
}: OnboardingDemoContentProps) {
  const currentIndex = ALL_STEPS.indexOf(currentStep);

  const topBar = (
    <div className='rounded-2xl border border-subtle bg-surface-0/80 backdrop-blur-sm'>
      <div className='flex items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6'>
        <span className='mr-2 shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400'>
          Dev
        </span>
        {ALL_STEPS.map((step, index) => (
          <button
            key={step}
            type='button'
            onClick={() => onStepChange(step)}
            className={cn(
              'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              currentStep === step
                ? 'bg-accent-token text-white'
                : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            <span className='mr-1 text-[10px] text-tertiary-token'>
              {index + 1}
            </span>
            {STEP_LABELS[step]}
          </button>
        ))}
      </div>
    </div>
  );

  const footer = (
    <div className='flex items-center justify-center gap-2 pt-1'>
      {ALL_STEPS.map((step, index) => (
        <button
          key={step}
          type='button'
          onClick={() => onStepChange(step)}
          aria-label={`Step ${index + 1}`}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            getDotClass(index, currentIndex)
          )}
        />
      ))}
    </div>
  );

  return (
    <OnboardingExperienceShell
      mode='embedded'
      stableStageHeight={currentStep === 'handle' ? 'tall' : 'default'}
      topBar={topBar}
      footer={footer}
      sidePanel={<OnboardingDemoProfilePanel currentStep={currentStep} />}
      stageClassName='overflow-hidden'
      data-testid='demo-onboarding-experience-shell'
      className={cn(
        'transition-opacity duration-700 ease-out',
        isRevealing ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <div className='mx-auto flex min-h-0 flex-1 w-full max-w-2xl flex-col'>
        <div className='flex-1 min-h-0 overflow-y-auto overscroll-contain'>
          <div className='mx-auto max-w-2xl'>
            <OnboardingDemoStep step={currentStep} onFinish={onFinish} />
          </div>
        </div>
      </div>
    </OnboardingExperienceShell>
  );
}
