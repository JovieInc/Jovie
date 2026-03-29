'use client';

import { cn } from '@/lib/utils';
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

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 flex flex-col transition-opacity duration-700 ease-out',
        isRevealing ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      style={{ backgroundColor: 'var(--color-surface-0, #f5f5f5)' }}
    >
      {/* Dev step picker — sits at top, clearly labeled */}
      <div className='shrink-0 border-b border-subtle bg-surface-0/80 backdrop-blur-sm'>
        <div className='mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6'>
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

      {/* Step content — H1 stays at a fixed vertical position */}
      <div className='flex-1 overflow-y-auto overscroll-contain'>
        <OnboardingDemoStep step={currentStep} onFinish={onFinish} />
      </div>

      {/* Step dots */}
      <div className='shrink-0 flex items-center justify-center gap-2 pb-8 pt-4'>
        {ALL_STEPS.map((step, index) => (
          <button
            key={step}
            type='button'
            onClick={() => onStepChange(step)}
            aria-label={`Step ${index + 1}`}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              index === currentIndex
                ? 'w-6 bg-primary-token'
                : index < currentIndex
                  ? 'w-1.5 bg-primary-token/40'
                  : 'w-1.5 bg-primary-token/15'
            )}
          />
        ))}
      </div>
    </div>
  );
}
