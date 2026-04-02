import {
  type AccentPaletteName,
  getAccentCssVars,
} from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';

export type OnboardingFlowStepId =
  | 'handle'
  | 'spotify'
  | 'artist-confirm'
  | 'upgrade'
  | 'dsp'
  | 'social'
  | 'releases'
  | 'late-arrivals'
  | 'profile-ready';

export type OnboardingRailStepId =
  | 'handle'
  | 'spotify'
  | 'artist-confirm'
  | 'upgrade'
  | 'dsp'
  | 'social'
  | 'releases'
  | 'profile-ready';

export type OnboardingRailStepState = 'complete' | 'current' | 'upcoming';

export interface OnboardingRailStepDefinition {
  readonly accent: AccentPaletteName;
  readonly id: OnboardingRailStepId;
  readonly label: string;
}

export const ONBOARDING_RAIL_STEPS: readonly OnboardingRailStepDefinition[] = [
  { accent: 'blue', id: 'handle', label: 'Claim Handle' },
  { accent: 'green', id: 'spotify', label: 'Find Your Spotify' },
  {
    accent: 'purple',
    id: 'artist-confirm',
    label: 'Confirm Artist',
  },
  { accent: 'pink', id: 'upgrade', label: 'Upgrade' },
  { accent: 'orange', id: 'dsp', label: 'Review DSPs' },
  { accent: 'teal', id: 'social', label: 'Review Socials' },
  { accent: 'red', id: 'releases', label: 'Review Releases' },
  {
    accent: 'green',
    id: 'profile-ready',
    label: 'Finish Profile',
  },
] as const;

function getRailStepIndex(stepId: OnboardingRailStepId) {
  return ONBOARDING_RAIL_STEPS.findIndex(step => step.id === stepId);
}

export function resolveRailStepId(
  currentStep: OnboardingFlowStepId
): OnboardingRailStepId {
  if (currentStep === 'late-arrivals') {
    return 'releases';
  }

  return currentStep;
}

export function getRailStepState(
  stepId: OnboardingRailStepId,
  currentStep: OnboardingFlowStepId
): OnboardingRailStepState {
  const currentRailStepId = resolveRailStepId(currentStep);
  const currentIndex = getRailStepIndex(currentRailStepId);
  const stepIndex = getRailStepIndex(stepId);

  if (stepIndex < currentIndex) {
    return 'complete';
  }

  if (stepIndex === currentIndex) {
    return 'current';
  }

  return 'upcoming';
}

export function OnboardingStepRail({
  currentStep,
}: Readonly<{
  currentStep: OnboardingFlowStepId;
}>) {
  return (
    <div className='pt-1' data-testid='onboarding-step-rail'>
      <p className='text-sm font-[590] text-primary-token'>Jovie set up</p>

      <ol className='mt-5 space-y-1' aria-label='Onboarding progress'>
        {ONBOARDING_RAIL_STEPS.map((step, index) => {
          const state = getRailStepState(step.id, currentStep);
          const accent = getAccentCssVars(step.accent);
          const isCurrent = state === 'current';
          const isComplete = state === 'complete';

          return (
            <li
              key={step.id}
              className='relative flex gap-3 py-1.5'
              data-state={state}
            >
              <div className='relative flex w-4 shrink-0 justify-center pt-1'>
                <span
                  aria-hidden='true'
                  data-testid={`onboarding-step-dot-${step.id}`}
                  className={cn(
                    'block h-2.5 w-2.5 rounded-full border transition-colors',
                    isComplete && 'border-transparent opacity-45',
                    state === 'upcoming' &&
                      'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] bg-transparent'
                  )}
                  style={
                    isCurrent || isComplete
                      ? {
                          backgroundColor: accent.solid,
                          borderColor: accent.solid,
                        }
                      : undefined
                  }
                />
                {index < ONBOARDING_RAIL_STEPS.length - 1 ? (
                  <span
                    aria-hidden='true'
                    className={cn(
                      'absolute top-4 bottom-[-8px] left-1/2 w-px -translate-x-1/2 bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)]',
                      isComplete &&
                        'bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_52%,transparent)]'
                    )}
                  />
                ) : null}
              </div>

              <div className='min-w-0 flex-1'>
                <p
                  className={cn(
                    'text-sm leading-5',
                    isCurrent && 'font-[590] text-primary-token',
                    isComplete && 'font-[450] text-secondary-token',
                    state === 'upcoming' && 'font-[450] text-tertiary-token'
                  )}
                >
                  {step.label}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function OnboardingStepProgressHeader({
  currentStep,
}: Readonly<{
  currentStep: OnboardingFlowStepId;
}>) {
  const currentRailStepId = resolveRailStepId(currentStep);
  const currentIndex = getRailStepIndex(currentRailStepId);

  return (
    <div className='space-y-4' data-testid='onboarding-step-progress-header'>
      <p className='text-sm font-[590] text-primary-token'>Jovie set up</p>

      <div className='grid grid-cols-4 gap-2 sm:grid-cols-8'>
        {ONBOARDING_RAIL_STEPS.map(step => {
          const state = getRailStepState(step.id, currentStep);
          const stepAccent = getAccentCssVars(step.accent);

          return (
            <span
              key={step.id}
              data-testid={`onboarding-progress-dot-${step.id}`}
              className={cn(
                'h-2 rounded-full border bg-transparent',
                state === 'current' &&
                  'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]',
                state === 'upcoming' &&
                  'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)]'
              )}
              style={
                state !== 'upcoming'
                  ? {
                      backgroundColor: stepAccent.solid,
                      borderColor: stepAccent.solid,
                      opacity: state === 'complete' ? 0.45 : 1,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      <p className='text-sm text-secondary-token'>
        {currentIndex + 1} of {ONBOARDING_RAIL_STEPS.length}
      </p>
    </div>
  );
}
