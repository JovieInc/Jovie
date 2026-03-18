'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { env } from '@/lib/env-client';
import { ONBOARDING_STEPS } from './types';

interface UseStepNavigationReturn {
  currentStepIndex: number;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  isTransitioning: boolean;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goBack: () => void;
}

/**
 * Hook to manage step navigation in the onboarding form.
 *
 * @param initialStepIndex - Step to start on (default 0). Used for step-resume
 *   when existing users return to onboarding to complete missing requirements.
 */
export function useStepNavigation(
  initialStepIndex = 0
): UseStepNavigationReturn {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToNextStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex >= ONBOARDING_STEPS.length - 1) return;
    if (env.IS_E2E) {
      setCurrentStepIndex(prev => prev + 1);
      return;
    }
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

  const goToPreviousStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex === 0) return;
    if (env.IS_E2E) {
      setCurrentStepIndex(prev => prev - 1);
      return;
    }
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev - 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0 && currentStepIndex > initialStepIndex) {
      goToPreviousStep();
    } else if (initialStepIndex > 0) {
      // Step-resume user at their starting step — go to dashboard, not previous steps
      router.push('/app');
    } else {
      router.back();
    }
  }, [currentStepIndex, goToPreviousStep, router, initialStepIndex]);

  return {
    currentStepIndex,
    setCurrentStepIndex,
    isTransitioning,
    goToNextStep,
    goToPreviousStep,
    goBack,
  };
}
