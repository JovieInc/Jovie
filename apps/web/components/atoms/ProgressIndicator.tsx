'use client';

import { useMemo } from 'react';

interface ProgressStep {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly estimatedTimeSeconds?: number;
}

interface ProgressIndicatorProps {
  readonly currentStep: number;
  readonly totalSteps: number;
  readonly steps: ProgressStep[];
  readonly showTimeEstimate?: boolean;
  readonly className?: string;
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  steps,
  showTimeEstimate = true,
  className = '',
}: ProgressIndicatorProps) {
  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  // Calculate remaining time estimate
  const remainingTime = useMemo(
    () =>
      steps
        .slice(currentStep + 1)
        .reduce((total, step) => total + (step.estimatedTimeSeconds || 30), 0),
    [steps, currentStep]
  );

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  };

  return (
    // Multi-step progress with custom styling; native <progress> doesn't support step indicators
    <div // NOSONAR S6819
      className={`space-y-4 ${className}`}
      role='progressbar'
      aria-label={`Progress: Step ${currentStep + 1} of ${totalSteps}`}
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
    >
      {/* Progress bar */}
      <div className='space-y-2'>
        <div className='flex justify-between items-center text-sm'>
          <span className='font-medium text-gray-900 dark:text-white'>
            Step {currentStep + 1} of {totalSteps}
          </span>
          {showTimeEstimate && remainingTime > 0 && (
            <span className='text-gray-500 dark:text-gray-400'>
              {formatTime(remainingTime)} remaining
            </span>
          )}
        </div>
        <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
          <div
            className='bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-300 ease-out'
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Step indicators */}
      <div className='flex justify-between items-center'>
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <div
              key={step.id}
              className={(() => {
                const baseClasses =
                  'flex flex-col items-center space-y-1 transition-all duration-200 flex-1';
                if (isCompleted)
                  return `${baseClasses} text-green-600 dark:text-green-400`;
                if (isCurrent)
                  return `${baseClasses} text-blue-600 dark:text-blue-400`;
                return `${baseClasses} text-gray-400 dark:text-gray-600`;
              })()}
            >
              {/* Step circle */}
              <div
                className={(() => {
                  const baseClasses =
                    'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-200';
                  if (isCompleted)
                    return `${baseClasses} bg-green-500 border-green-500 text-white`;
                  if (isCurrent)
                    return `${baseClasses} bg-blue-500 border-blue-500 text-white`;
                  return `${baseClasses} bg-white dark:bg-gray-800 border-default text-gray-500 dark:text-gray-400`;
                })()}
              >
                {isCompleted ? (
                  <svg
                    className='w-4 h-4 sm:w-5 sm:h-5'
                    fill='currentColor'
                    viewBox='0 0 20 20'
                    aria-hidden='true'
                  >
                    <path
                      fillRule='evenodd'
                      d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                      clipRule='evenodd'
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              {/* Step title */}
              <div className='text-center'>
                <div
                  className={`text-xs sm:text-sm font-medium ${isCurrent ? 'font-semibold' : ''} max-w-16 sm:max-w-none`}
                >
                  {step.title}
                </div>
                {step.description && isCurrent && (
                  <div className='hidden sm:block text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-20 leading-tight'>
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
