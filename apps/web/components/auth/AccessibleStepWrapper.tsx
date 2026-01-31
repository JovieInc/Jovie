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

/**
 * Wrapper component that announces step progress to screen readers.
 * Improves accessibility for multi-step auth flows (signin, signup, etc.).
 */
export function AccessibleStepWrapper({
  currentStep,
  totalSteps,
  stepTitle,
  children,
}: Readonly<AccessibleStepWrapperProps>) {
  return (
    <div>
      {/* Screen reader only announcement */}
      <h2 className='sr-only' aria-live='polite' aria-atomic='true'>
        Step {currentStep} of {totalSteps}: {stepTitle}
      </h2>
      {children}
    </div>
  );
}
