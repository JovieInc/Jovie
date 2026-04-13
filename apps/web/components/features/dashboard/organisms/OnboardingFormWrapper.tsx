'use client';

import { useEffect, useState } from 'react';
import { OnboardingV2Form } from './onboarding-v2/OnboardingV2Form';

interface OnboardingFormWrapperProps {
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly isReservedHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly shouldAutoSubmitHandle?: boolean;
  readonly initialProfileId?: string | null;
  readonly initialResumeStep?: string | null;
  readonly existingAvatarUrl?: string | null;
  readonly existingBio?: string | null;
  readonly existingGenres?: string[] | null;
}

export function OnboardingFormWrapper({
  initialDisplayName = '',
  initialHandle = '',
  isReservedHandle = false,
  userEmail = null,
  userId,
  shouldAutoSubmitHandle = false,
  initialProfileId = null,
  initialResumeStep = null,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
}: OnboardingFormWrapperProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const formKey = initialHandle || '__empty__';

  return (
    <div
      data-testid='onboarding-form-wrapper'
      data-hydrated={isHydrated ? 'true' : 'false'}
    >
      <OnboardingV2Form
        key={formKey}
        initialDisplayName={initialDisplayName}
        initialHandle={initialHandle}
        isHydrated={isHydrated}
        isReservedHandle={isReservedHandle}
        userEmail={userEmail}
        userId={userId}
        shouldAutoSubmitHandle={shouldAutoSubmitHandle}
        initialProfileId={initialProfileId}
        initialResumeStep={initialResumeStep}
        existingAvatarUrl={existingAvatarUrl}
        existingBio={existingBio}
        existingGenres={existingGenres}
      />
    </div>
  );
}
