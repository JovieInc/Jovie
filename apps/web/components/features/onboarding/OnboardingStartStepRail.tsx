'use client';

import { TransitionPanel } from '@/components/ui/transition-panel';
import { cn } from '@/lib/utils';
import type { OnboardingProfileBuilderState } from './onboardingProfileRailState';
import {
  ONBOARDING_START_STEPS,
  resolveOnboardingStartStepIndex,
} from './onboardingStartSteps';

export interface OnboardingStartStepRailProps {
  readonly state: OnboardingProfileBuilderState;
  readonly className?: string;
}

/**
 * Quiet three-step rail for /start (JOV-14243). Labels only; active step is
 * readable, completed steps contract, future steps stay quiet. Step panel
 * content cross-fades via Motion Primitives Transition Panel.
 */
export function OnboardingStartStepRail({
  state,
  className,
}: OnboardingStartStepRailProps) {
  const activeIndex = resolveOnboardingStartStepIndex(state);

  return (
    <div
      className={cn('system-b-onboarding-step-rail', className)}
      data-testid='onboarding-start-step-rail'
      data-active-step={ONBOARDING_START_STEPS[activeIndex]?.id}
    >
      <ol
        className='system-b-onboarding-step-rail-list'
        aria-label='Getting Started'
      >
        {ONBOARDING_START_STEPS.map((step, index) => {
          const status =
            index < activeIndex
              ? 'done'
              : index === activeIndex
                ? 'active'
                : 'todo';
          return (
            <li
              key={step.id}
              className='system-b-onboarding-step-rail-item'
              data-status={status}
              data-testid={`onboarding-start-step-${step.id}`}
            >
              <span className='system-b-onboarding-step-rail-label'>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className='system-b-onboarding-step-rail-panel'>
        <TransitionPanel
          activeIndex={activeIndex}
          data-testid='onboarding-start-step-panel'
        >
          {ONBOARDING_START_STEPS.map(step => (
            <p
              key={step.id}
              className='system-b-onboarding-step-rail-hint text-balance'
            >
              {step.hint}
            </p>
          ))}
        </TransitionPanel>
      </div>
    </div>
  );
}
