'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DemoClientProviders } from './DemoClientProviders';
import {
  type DemoOnboardingStepId,
  OnboardingDemoContent,
} from './OnboardingDemoContent';

export function OnboardingDemoExperience() {
  const [currentStep, setCurrentStep] =
    useState<DemoOnboardingStepId>('handle');
  const [isRevealing, setIsRevealing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  const handleFinish = useCallback(() => {
    setIsRevealing(true);
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = setTimeout(() => setIsComplete(true), 800);
  }, []);

  return (
    <DemoClientProviders>
      {!isComplete && (
        <OnboardingDemoContent
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          isRevealing={isRevealing}
          onFinish={handleFinish}
        />
      )}
    </DemoClientProviders>
  );
}
