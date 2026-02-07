import type { ReactNode } from 'react';

interface AccessibleStepWrapperProps {
  /**
   * Current step number (1-indexed)
   */
  readonly currentStep: number;
  /**
   * Total number of steps in the flow
   */
  readonly totalSteps: number;
  /**
   * Title describing the current step
   */
  readonly stepTitle: string;
  /**
   * Content to render for this step
   */
  readonly children: ReactNode;
}

function getStepDotStyle(stepNum: number, currentStep: number): string {
  if (stepNum === currentStep) return 'w-6 h-2 bg-primary-token';
  if (stepNum < currentStep) return 'w-2 h-2 bg-primary-token/60';
  return 'w-2 h-2 bg-gray-300 dark:bg-gray-600';
}

/**
 * Wrapper component that shows visual step progress and announces it to screen readers.
 * Displays a dot indicator and "Step X of Y" label for sighted users,
 * plus an aria-live announcement for screen reader users.
 */
export function AccessibleStepWrapper({
  currentStep,
  totalSteps,
  stepTitle,
  children,
}: Readonly<AccessibleStepWrapperProps>) {
  return (
    <div>
      {/* Screen reader announcement */}
      <p className='sr-only' aria-live='polite' aria-atomic='true'>
        Step {currentStep} of {totalSteps}: {stepTitle}
      </p>

      {/* Visual step indicator */}
      <div className='flex items-center justify-center gap-2 mb-4'>
        <div className='flex items-center gap-1.5' aria-hidden='true'>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i + 1}
              className={`rounded-full transition-all duration-200 ${getStepDotStyle(i + 1, currentStep)}`}
            />
          ))}
        </div>
        <span className='text-xs text-secondary-token'>
          Step {currentStep} of {totalSteps}
        </span>
      </div>

      {children}
    </div>
  );
}
