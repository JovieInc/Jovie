'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { OnboardingHandleOnlyForm } from './OnboardingHandleOnlyForm';

const SIDEBAR_STEP_KEYS = [
  'handle',
  'spotify',
  'plan',
  'dsps',
  'social',
  'releases',
  'finish',
] as const;

function OnboardingFormLoadingShell() {
  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight='tall'
      stageVariant='flat'
      sidebar={
        <nav aria-label='Onboarding steps loading'>
          <ul className='space-y-1.5'>
            {SIDEBAR_STEP_KEYS.map(key => (
              <li key={key}>
                <div className='flex items-center gap-3 rounded-xl px-2 py-2'>
                  <div className='h-4 w-4 shrink-0 rounded-full skeleton' />
                  <div className='h-3.5 w-14 skeleton rounded-md' />
                </div>
              </li>
            ))}
          </ul>
        </nav>
      }
      sidebarTitle='Jovie Setup'
      data-testid='onboarding-loading-shell'
    >
      <div className='flex h-full flex-col items-center justify-center'>
        <div className='flex w-full max-w-md flex-col'>
          <div className='mb-8 flex flex-col items-center justify-center'>
            <div className='h-7 w-52 skeleton rounded-md' />
            <div className='mt-2 h-5 w-72 skeleton rounded-md' />
          </div>

          <div className='rounded-xl border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] p-4 sm:p-5'>
            <div className='w-full space-y-3'>
              <div className='flex w-full items-center gap-3 rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))] px-4 py-3'>
                <div className='h-4 w-3 skeleton rounded' />
                <div className='h-5 flex-1 skeleton rounded-md' />
              </div>
              <div className='min-h-[24px]' />
              <div className='h-11 w-full skeleton rounded-full' />
            </div>
          </div>

          <div className='mt-6 min-h-[40px]' />
        </div>
      </div>
    </OnboardingExperienceShell>
  );
}

const OnboardingV2Form = dynamic(
  () =>
    import('./onboarding-v2/OnboardingV2Form').then(
      mod => mod.OnboardingV2Form
    ),
  {
    loading: () => <OnboardingFormLoadingShell />,
  }
);

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
  // Server-seeded handles are already stable at render time, so they do not
  // need to wait for the client-only pendingClaim reconciliation pass.
  const [isHydrated, setIsHydrated] = useState(() => Boolean(initialHandle));

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
    if (!isHydrated) {
      setIsHydrated(true);
    }
  }, [isHydrated]);

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
  const isResumeFlow = Boolean(initialResumeStep || initialProfileId);

  return (
    <div
      data-testid='onboarding-form-wrapper'
      data-hydrated={isHydrated ? 'true' : 'false'}
    >
      {isResumeFlow ? (
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
      ) : (
        <OnboardingHandleOnlyForm
          initialDisplayName={initialDisplayName}
          initialHandle={resolvedHandle}
          isHydrated={isHydrated}
          isReservedHandle={isReservedHandle}
          userEmail={userEmail}
          userId={userId}
          shouldAutoSubmitHandle={shouldAutoSubmitHandle}
        />
      )}
    </div>
  );
}
