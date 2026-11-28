'use client';

import { createContext, use } from 'react';
import type { ClaimStatus } from '@/components/features/onboarding/useOnboardingClaim';

/**
 * Claim handoff status for the signed-in Keep card (ONB-36).
 * Shell owns `useOnboardingClaim`; the propose-next-step card reads this so
 * in-chat copy cannot promise a receipt after claim already failed.
 *
 * Lives under hooks/ (not components/) so story/cert gates do not treat it
 * as a new UI surface — it only publishes a status string.
 */
const OnboardingClaimHandoffContext = createContext<ClaimStatus>('idle');

export function OnboardingClaimHandoffProvider({
  status,
  children,
}: {
  readonly status: ClaimStatus;
  readonly children: React.ReactNode;
}) {
  return (
    <OnboardingClaimHandoffContext.Provider value={status}>
      {children}
    </OnboardingClaimHandoffContext.Provider>
  );
}

export function useOnboardingClaimHandoffStatus(): ClaimStatus {
  return use(OnboardingClaimHandoffContext);
}
