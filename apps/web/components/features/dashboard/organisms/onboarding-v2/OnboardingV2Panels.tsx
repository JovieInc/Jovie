import { Button } from '@jovie/ui';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  getSidebarStepState,
  normalizeSidebarCurrentStep,
  type StepId,
} from './onboardingV2Model';

export interface StepFrameProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly prompt?: string;
  readonly title: string;
}

export function StepFrame({
  actions,
  children,
  prompt,
  title,
}: StepFrameProps) {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col gap-6'>
      <div className='space-y-3'>
        <h1 className='text-3xl text-balance font-semibold tracking-normal text-primary-token sm:text-4xl'>
          {title}
        </h1>
        {prompt ? (
          <p className='max-w-xl text-sm leading-6 text-secondary-token sm:text-mid'>
            {prompt}
          </p>
        ) : null}
      </div>

      <div className='space-y-4'>{children}</div>

      {actions ? (
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function FlatPanel({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('system-b-onboarding-flat-panel', className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  body,
  title,
}: Readonly<{ body: string; title: string }>) {
  return (
    <div className='system-b-onboarding-empty-state'>
      <p className='text-sm font-semibold text-primary-token'>{title}</p>
      <p className='mt-1 text-sm leading-6 text-secondary-token'>{body}</p>
    </div>
  );
}

export function StepCircleIcon({
  className,
  stepId,
  state,
}: Readonly<{
  className?: string;
  stepId: StepId;
  state: 'complete' | 'current' | 'pending';
}>) {
  let innerShape: ReactNode;
  if (state === 'complete') {
    innerShape = (
      <circle cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='2' />
    );
  } else if (state === 'current') {
    innerShape = (
      <>
        {/* Solid left half */}
        <path
          d='M12 2a10 10 0 0 0 0 20'
          stroke='currentColor'
          strokeWidth='2'
          fill='none'
        />
        {/* Dotted right half */}
        <path
          d='M12 2a10 10 0 0 1 0 20'
          stroke='currentColor'
          strokeWidth='2'
          strokeDasharray='2.5 2.5'
          fill='none'
        />
      </>
    );
  } else {
    innerShape = (
      <circle
        cx='12'
        cy='12'
        r='10'
        stroke='currentColor'
        strokeWidth='2'
        strokeDasharray='2.5 2.5'
        opacity={0.35}
      />
    );
  }

  return (
    <svg
      aria-hidden='true'
      className={cn(
        state === 'pending' ? 'text-current' : 'system-b-onboarding-step-icon',
        className
      )}
      data-step={state === 'pending' ? undefined : stepId}
      viewBox='0 0 24 24'
      fill='none'
    >
      {innerShape}
    </svg>
  );
}

export function OnboardingSidebar({
  currentStep,
  onBack,
  steps,
}: Readonly<{
  currentStep: StepId;
  onBack?: () => void;
  steps: ReadonlyArray<Readonly<{ id: StepId; label: string }>>;
}>) {
  const displayStep = normalizeSidebarCurrentStep(currentStep);
  const currentIndex = steps.findIndex(s => s.id === displayStep);
  const currentLabel = steps[currentIndex]?.label ?? steps[0].label;

  return (
    <div>
      {onBack ? (
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          onClick={onBack}
          aria-label='Go Back'
          className='mb-3'
        >
          <ArrowRight className='h-4 w-4 rotate-180' />
        </Button>
      ) : null}
      {/* Compact progress indicator for small screens */}
      <div className='flex items-center gap-3 sm:hidden'>
        <span className='text-app font-semibold text-primary-token'>
          {currentLabel}
        </span>
        <span className='text-xs text-tertiary-token'>
          {currentIndex + 1}/{steps.length}
        </span>
        <div className='flex flex-1 gap-1'>
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                i <= currentIndex ? 'bg-primary-token' : 'bg-surface-2'
              )}
            />
          ))}
        </div>
      </div>

      {/* Full step list for sm+ screens */}
      <ul className='hidden space-y-1.5 sm:block'>
        {steps.map(step => {
          const state = getSidebarStepState(step.id, displayStep);
          const isCurrent = state === 'current';

          return (
            <li key={step.id} aria-current={isCurrent ? 'step' : undefined}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-xl px-2 py-2 text-app transition-colors',
                  isCurrent
                    ? 'bg-surface-1 text-primary-token'
                    : 'text-secondary-token'
                )}
              >
                <StepCircleIcon
                  className='h-4 w-4 shrink-0'
                  stepId={step.id}
                  state={state}
                />
                <span className='font-semibold'>{step.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
