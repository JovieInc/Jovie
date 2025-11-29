'use client';

import { AppleStyleOnboardingForm } from './AppleStyleOnboardingForm';

interface OnboardingFormWrapperProps {
  initialDisplayName?: string;
  initialHandle?: string;
  userEmail?: string | null;
  userId: string;
}

export function OnboardingFormWrapper({
  initialDisplayName = '',
  initialHandle = '',
  userEmail = null,
  userId,
}: OnboardingFormWrapperProps) {
  return (
    <AppleStyleOnboardingForm
      initialDisplayName={initialDisplayName}
      initialHandle={initialHandle}
      userEmail={userEmail}
      userId={userId}
    />
  );
}
