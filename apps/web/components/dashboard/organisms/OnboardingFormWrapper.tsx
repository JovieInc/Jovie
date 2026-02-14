'use client';

import { useEffect, useMemo } from 'react';
import { AppleStyleOnboardingForm } from './apple-style-onboarding';

/** Max age (ms) for a pendingClaim entry to be considered valid (10 minutes). */
const PENDING_CLAIM_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Read the pendingClaim handle from sessionStorage (pure, no side effects).
 * Returns the handle string or empty string if none found / expired.
 */
function readPendingClaimHandle(): string {
  try {
    const raw = sessionStorage.getItem('pendingClaim');
    if (!raw) return '';

    const parsed = JSON.parse(raw) as { handle?: string; ts?: number };
    if (
      !parsed.handle ||
      typeof parsed.handle !== 'string' ||
      (parsed.ts && Date.now() - parsed.ts > PENDING_CLAIM_MAX_AGE_MS)
    ) {
      return '';
    }
    return parsed.handle;
  } catch {
    return '';
  }
}

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
  // If the server didn't provide a handle (e.g. OAuth flow stripped the query param),
  // fall back to the pendingClaim stored in sessionStorage by ClaimHandleForm.
  const resolvedHandle = useMemo(() => {
    if (initialHandle) return initialHandle;
    return readPendingClaimHandle();
  }, [initialHandle]);

  // Clean up sessionStorage after mount (side effect deferred from render)
  useEffect(() => {
    if (!initialHandle && resolvedHandle) {
      sessionStorage.removeItem('pendingClaim');
    }
  }, [initialHandle, resolvedHandle]);

  return (
    <div data-testid='onboarding-form-wrapper'>
      <AppleStyleOnboardingForm
        initialDisplayName={initialDisplayName}
        initialHandle={resolvedHandle}
        userEmail={userEmail}
        userId={userId}
        skipNameStep={skipNameStep}
      />
    </div>
  );
}
