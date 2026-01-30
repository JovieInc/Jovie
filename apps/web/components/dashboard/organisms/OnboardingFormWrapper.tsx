'use client';

import { AppleStyleOnboardingForm } from './apple-style-onboarding';

interface OnboardingFormWrapperProps {
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly skipNameStep?: boolean;
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
