'use client';

import { useEffect, useState } from 'react';
import { AppleStyleOnboardingForm } from './apple-style-onboarding';

/** Max age (ms) for a pendingClaim entry to be considered valid (10 minutes). */
const PENDING_CLAIM_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Read the pendingClaim handle from sessionStorage (pure, no side effects).
 * Returns the handle string or empty string if none found / expired.
 */
function readPendingClaimHandle(): string {
  try {
    const raw = globalThis.sessionStorage?.getItem('pendingClaim');
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
  readonly isReservedHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly shouldAutoSubmitHandle?: boolean;
  /** Step to start on (default 0). Used for step-resume when existing users return. */
  readonly initialStepIndex?: number;
  /** Existing profile avatar URL for step-resume users */
  readonly existingAvatarUrl?: string | null;
  /** Existing profile bio for step-resume users */
  readonly existingBio?: string | null;
  /** Existing profile genres for step-resume users */
  readonly existingGenres?: string[] | null;
}

export function OnboardingFormWrapper({
  initialDisplayName = '',
  initialHandle = '',
  isReservedHandle = false,
  userEmail = null,
  userId,
  shouldAutoSubmitHandle = false,
  initialStepIndex = 0,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
}: OnboardingFormWrapperProps) {
  const [resolvedHandle, setResolvedHandle] = useState(initialHandle);

  // Defer sessionStorage reads until after mount to keep the first client render
  // aligned with the server HTML and avoid hydration-only hook-order errors.
  useEffect(() => {
    if (initialHandle) {
      setResolvedHandle(initialHandle);
      return;
    }

    const pendingHandle = readPendingClaimHandle();
    if (!pendingHandle) {
      return;
    }

    setResolvedHandle(pendingHandle);

    try {
      globalThis.sessionStorage?.removeItem('pendingClaim');
    } catch {
      // sessionStorage may be unavailable in restricted contexts
    }
  }, [initialHandle]);

  const formKey = resolvedHandle || '__empty__';

  return (
    <div data-testid='onboarding-form-wrapper'>
      <AppleStyleOnboardingForm
        key={formKey}
        initialDisplayName={initialDisplayName}
        initialHandle={resolvedHandle}
        isReservedHandle={isReservedHandle}
        userEmail={userEmail}
        userId={userId}
        shouldAutoSubmitHandle={shouldAutoSubmitHandle}
        initialStepIndex={initialStepIndex}
        existingAvatarUrl={existingAvatarUrl}
        existingBio={existingBio}
        existingGenres={existingGenres}
      />
    </div>
  );
}
