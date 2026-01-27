'use client';

import { useEffect, useState } from 'react';

interface OptimisticProgressProps {
  isActive: boolean;
  steps: Array<{
    key: string;
    label: string;
    duration: number; // milliseconds for this step
  }>;
  onComplete?: () => void;
}

interface ProgressState {
  currentStep: number;
  progress: number;
  isComplete: boolean;
}

export function OptimisticProgress({
  isActive,
  steps,
  onComplete,
}: OptimisticProgressProps) {
  const [state, setState] = useState<ProgressState>({
    currentStep: 0,
    progress: 0,
    isComplete: false,
  });

  useEffect(() => {
    if (!isActive || steps.length === 0) {
      setState({ currentStep: 0, progress: 0, isComplete: false });
      return;
    }

    let timeoutId: NodeJS.Timeout;
    let currentStepIndex = 0;
    let elapsedTime = 0;

    const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
    // Note: totalDuration is computed inside useEffect to avoid closure issues with memoized values

    const updateProgress = () => {
      if (currentStepIndex >= steps.length) {
        setState({
          currentStep: steps.length - 1,
          progress: 100,
          isComplete: true,
        });
        onComplete?.();
        return;
      }

      const currentStep = steps[currentStepIndex];
      const stepProgress = Math.min(100, (elapsedTime / totalDuration) * 100);

      setState({
        currentStep: currentStepIndex,
        progress: stepProgress,
        isComplete: false,
      });

      // Move to next step when current step duration is reached
      const stepStartTime = steps
        .slice(0, currentStepIndex)
        .reduce((sum, step) => sum + step.duration, 0);

      if (elapsedTime >= stepStartTime + currentStep.duration) {
        currentStepIndex++;
      }

      elapsedTime += 50; // Update every 50ms for smooth animation
      timeoutId = setTimeout(updateProgress, 50);
    };

    updateProgress();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isActive, steps, onComplete]);

  if (!isActive) {
    return null;
  }

  const currentStep = steps[state.currentStep];

  // Get step text color class based on completion state
  const getStepTextColor = (index: number) => {
    if (index < state.currentStep) {
      return 'text-green-600 dark:text-green-400';
    }
    if (index === state.currentStep) {
      return 'text-blue-600 dark:text-blue-400';
    }
    return 'text-gray-400 dark:text-gray-600';
  };

  // Get step dot color class based on completion state
  const getStepDotColor = (index: number) => {
    if (index < state.currentStep) {
      return 'bg-green-500';
    }
    if (index === state.currentStep) {
      return 'bg-blue-500';
    }
    return 'bg-gray-300 dark:bg-gray-600';
  };

  return (
    // role="status" is correct for progress announcements; <output> is for form results
    <div // NOSONAR S6819
      className='space-y-3'
      aria-live='polite'
      role='status'
    >
      {/* Progress bar */}
      <div className='space-y-2'>
        <div className='flex justify-between text-sm text-gray-600 dark:text-gray-400'>
          <span>{currentStep?.label || 'Processing...'}</span>
          <span>{Math.round(state.progress)}%</span>
        </div>
        <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
          {/* Custom progress bar with gradient styling; native <progress> can't be styled this way */}
          <div // NOSONAR S6819
            className='bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-100 ease-out'
            style={{ width: `${state.progress}%` }}
            role='progressbar'
            aria-valuenow={Math.round(state.progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label='Operation progress'
          />
        </div>
      </div>
      {/* Step indicators */}
      <div className='flex justify-between'>
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={`flex items-center space-x-1 text-xs transition-colors duration-200 ${getStepTextColor(index)}`}
          >
            <div
              className={`w-2 h-2 rounded-full transition-colors duration-200 ${getStepDotColor(index)}`}
            />
            <span className='hidden sm:inline'>{step.label}</span>
          </div>
        ))}
      </div>
      {/* Completion indicator */}
      {state.isComplete && (
        <div className='flex items-center justify-center space-x-2 text-green-600 dark:text-green-400 text-sm font-medium'>
          <svg
            className='w-4 h-4'
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
          <span>Profile created successfully!</span>
        </div>
      )}
    </div>
  );
}
