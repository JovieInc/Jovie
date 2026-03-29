'use client';

import { useCallback, useState } from 'react';
import { DemoAuthShell } from './DemoAuthShell';
import { OnboardingDemoContent } from './OnboardingDemoContent';
import type { StepId } from './OnboardingDemoSteps';

export function OnboardingDemoExperience() {
  const [currentStep, setCurrentStep] = useState<StepId>('handle');
  const [isRevealing, setIsRevealing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleFinish = useCallback(() => {
    setIsRevealing(true);
    // After the fade-out completes, remove the overlay entirely
    setTimeout(() => setIsComplete(true), 800);
  }, []);

  return (
    <DemoAuthShell>
      {!isComplete && (
        <OnboardingDemoContent
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          isRevealing={isRevealing}
          onFinish={handleFinish}
        />
      )}
    </DemoAuthShell>
  );
}
