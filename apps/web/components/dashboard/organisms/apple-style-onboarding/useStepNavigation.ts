'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
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
 */
export function useStepNavigation(): UseStepNavigationReturn {
  const router = useRouter();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToNextStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex >= ONBOARDING_STEPS.length - 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev + 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

  const goToPreviousStep = useCallback(() => {
    if (isTransitioning) return;
    if (currentStepIndex === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStepIndex(prev => prev - 1);
      setIsTransitioning(false);
    }, 250);
  }, [currentStepIndex, isTransitioning]);

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      goToPreviousStep();
    } else {
      router.back();
    }
  }, [currentStepIndex, goToPreviousStep, router]);

  return {
    currentStepIndex,
    setCurrentStepIndex,
    isTransitioning,
    goToNextStep,
    goToPreviousStep,
    goBack,
  };
}
