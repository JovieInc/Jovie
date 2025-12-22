'use client';

import { AppleStyleOnboardingForm } from './AppleStyleOnboardingForm';

interface OnboardingFormWrapperProps {
  initialDisplayName?: string;
  initialHandle?: string;
  userEmail?: string | null;
  userId: string;
  skipNameStep?: boolean;
}

export function OnboardingFormWrapper({
  initialDisplayName = '',
  initialHandle = '',
  userEmail = null,
  userId,
  skipNameStep = false,
}: OnboardingFormWrapperProps) {
  return (
    <div data-testid='onboarding-form-wrapper'>
      <AppleStyleOnboardingForm
        initialDisplayName={initialDisplayName}
        initialHandle={initialHandle}
        userEmail={userEmail}
        userId={userId}
        skipNameStep={skipNameStep}
      />
    </div>
  );
}
