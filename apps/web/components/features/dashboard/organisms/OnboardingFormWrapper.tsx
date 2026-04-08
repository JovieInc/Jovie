'use client';

import { useEffect, useState } from 'react';
import { OnboardingV2Form } from './onboarding-v2/OnboardingV2Form';

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
  readonly initialProfileId?: string | null;
  readonly initialResumeStep?: string | null;
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
  initialProfileId = null,
  initialResumeStep = null,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
}: OnboardingFormWrapperProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  // Resolve the handle synchronously on first render to avoid a key-change
  // remount that causes a visible layout shift.  sessionStorage is available
  // during the initial client render (CSR after server HTML hydration), so
  // reading it eagerly is safe and keeps the form key stable.
  const [resolvedHandle] = useState(() => {
    if (initialHandle) return initialHandle;
    return readPendingClaimHandle() || initialHandle;
  });

  // Clean up the consumed pendingClaim entry in an effect (not in the
  // useState initializer) to avoid a side effect during render, which
  // React StrictMode would execute twice.
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (resolvedHandle && resolvedHandle !== initialHandle) {
      try {
        globalThis.sessionStorage?.removeItem('pendingClaim');
      } catch {
        // sessionStorage may be unavailable in restricted contexts
      }
    }
  }, [resolvedHandle, initialHandle]);

  // Stable key — never changes after mount, preventing full-form CLS.
  const formKey = resolvedHandle || '__empty__';

  return (
    <div
      data-testid='onboarding-form-wrapper'
      data-hydrated={isHydrated ? 'true' : 'false'}
    >
      <OnboardingV2Form
        key={formKey}
        initialDisplayName={initialDisplayName}
        initialHandle={resolvedHandle}
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
