'use client';

// @coverage-via ./OpportunityInboxPageClient.setup.test.tsx

import { type RefObject, useContext, useEffect, useRef, useState } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { AvailableDSP } from '@/lib/dsp';
import type { HomeSetupProgress } from './OpportunityInboxEmptyState';

interface HomeSetupInput {
  readonly profileId: string | null;
  readonly connectedDSPs: readonly AvailableDSP[];
  readonly initialLinks: readonly ProfileSocialLink[];
  readonly inboxView: 'needs' | 'done';
  readonly inboxPageRef: RefObject<HTMLDivElement | null>;
  readonly hasReviewableItems: boolean;
  readonly hasTourHistory: boolean;
  readonly inboxReadUnavailable: boolean;
  readonly runtimeUpdateAvailable: boolean;
  readonly hasNotes: boolean;
}

/** Derive setup only for a known profile with a usable editor. An empty read
 * proves neither a first conversation nor the absence of completed work.
 */
export function useHomeSetup({
  profileId,
  connectedDSPs,
  initialLinks,
  inboxView,
  inboxPageRef,
  hasReviewableItems,
  hasTourHistory,
  inboxReadUnavailable,
  runtimeUpdateAvailable,
  hasNotes,
}: HomeSetupInput) {
  const data = useContext(DashboardDataContext);
  const homeFocusRequested = useRef(false);
  // Once work appears, clearing it retains the existing queue and focus path.
  const [hasSeenWork, setHasSeenWork] = useState(
    hasReviewableItems || hasTourHistory
  );
  useEffect(() => {
    if (hasReviewableItems || hasTourHistory) setHasSeenWork(true);
  }, [hasReviewableItems, hasTourHistory]);
  const showSetup = Boolean(
    data &&
      !data.dashboardLoadError &&
      data.selectedProfile?.id === profileId &&
      !hasSeenWork &&
      !hasReviewableItems &&
      !hasTourHistory &&
      !inboxReadUnavailable &&
      !runtimeUpdateAvailable &&
      !hasNotes &&
      inboxView === 'needs'
  );
  useEffect(() => {
    if (!showSetup || !homeFocusRequested.current) return;
    homeFocusRequested.current = false;
    inboxPageRef.current
      ?.querySelector<HTMLElement>('[data-home-setup] a')
      ?.focus();
  }, [showSetup, inboxPageRef]);

  const setup: HomeSetupProgress | undefined = showSetup
    ? {
        profileComplete: data?.profileCompletion.percentage === 100,
        musicConnected:
          connectedDSPs.length > 0 || data?.hasMusicLinks === true,
        linksAdded:
          initialLinks.some(
            link =>
              link.isActive === true &&
              link.state !== 'suggested' &&
              link.state !== 'rejected' &&
              Boolean(link.url.trim())
          ) || data?.hasSocialLinks === true,
      }
    : undefined;

  return {
    setup,
    requestHomeFocus: () => {
      homeFocusRequested.current = true;
    },
  };
}
