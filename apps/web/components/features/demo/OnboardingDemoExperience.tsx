'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoOnboardingShell } from './DemoOnboardingShell';
import { OnboardingDemoContent } from './OnboardingDemoContent';
import type { StepId } from './OnboardingDemoSteps';

export function OnboardingDemoExperience() {
  const [currentStep, setCurrentStep] = useState<StepId>('handle');
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
    <DemoAuthShell>
      {!isComplete && (
        <DemoOnboardingShell currentStep={currentStep}>
          <OnboardingDemoContent
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            isRevealing={isRevealing}
            onFinish={handleFinish}
            rail={null}
            topBar={null}
            footer={null}
          />
        </DemoOnboardingShell>
      )}
    </DemoAuthShell>
  );
}
