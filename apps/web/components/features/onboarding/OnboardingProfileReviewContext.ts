'use client';

import { createContext, useContext } from 'react';
import type { OnboardingProfileBuilderState } from './OnboardingProfileRail';

/** Presentation only. Claim admission and ownership remain server validated. */
export const OnboardingProfileReviewContext = createContext<{
  readonly state: OnboardingProfileBuilderState;
  readonly onEditDetails: () => void;
} | null>(null);

export function useOnboardingProfileReview() {
  return useContext(OnboardingProfileReviewContext);
}
