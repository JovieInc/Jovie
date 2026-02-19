'use client';

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
  const remainingTime = steps
    .slice(currentStep + 1)
    .reduce((total, step) => total + (step.estimatedTimeSeconds || 30), 0);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <progress
      className={`space-y-4 ${className}`}
      aria-label={`Progress: Step ${currentStep + 1} of ${totalSteps}`}
      value={currentStep + 1}
      max={totalSteps}
    >
      <div className='space-y-2'>
        <div className='flex justify-between items-center text-sm'>
          <span className='font-medium text-primary-token'>
            Step {currentStep + 1} of {totalSteps}
          </span>
          {showTimeEstimate && remainingTime > 0 && (
            <span className='text-tertiary-token'>
              {formatTime(remainingTime)} remaining
            </span>
          )}
        </div>
        <div className='w-full bg-surface-2 rounded-full h-2 overflow-hidden'>
          <div
            className='bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-300 ease-out'
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

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
                if (isCompleted) return `${baseClasses} text-success`;
                if (isCurrent) return `${baseClasses} text-accent`;
                return `${baseClasses} text-quaternary-token`;
              })()}
            >
              <div
                className={(() => {
                  const baseClasses =
                    'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-200';
                  if (isCompleted)
                    return `${baseClasses} bg-green-500 border-green-500 text-white`;
                  if (isCurrent)
                    return `${baseClasses} bg-blue-500 border-blue-500 text-white`;
                  return `${baseClasses} bg-surface-1 border-default text-tertiary-token`;
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

              <div className='text-center max-w-20 sm:max-w-none'>
                <div className='text-xs sm:text-sm font-medium truncate'>
                  {step.title}
                </div>
                {isCurrent && step.description && (
                  <div className='text-xs opacity-75 hidden sm:block truncate'>
                    {step.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </progress>
  );
}
