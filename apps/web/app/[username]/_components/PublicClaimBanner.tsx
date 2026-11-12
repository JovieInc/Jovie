'use client';

import { ClaimBanner } from '@/features/profile/ClaimBanner';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { claimHrefWithAttribution } from '@/lib/claim/attribution';
import type { ProfileVisitorState } from '@/lib/claim/types';
import { resolveClaimBannerState } from '../_lib/claim-banner-state';

interface PublicClaimBannerProps {
  readonly profileHandle: string;
  readonly displayName: string;
  readonly directClaimSupported: boolean;
  readonly claimRequiresVerification?: boolean;
  readonly isClaimed: boolean;
  readonly prefetch?: boolean;
  readonly visitorState: ProfileVisitorState;
}

export function PublicClaimBanner({
  profileHandle,
  displayName,
  directClaimSupported,
  claimRequiresVerification = false,
  isClaimed,
  prefetch,
  visitorState,
}: PublicClaimBannerProps) {
  const locationSearch = useLocationSearch();
  const locationKnown = locationSearch !== null;
  const claimSearchParam =
    new URLSearchParams(locationSearch ?? '').get('claim') ?? undefined;
  const bannerInputs = {
    visitorState,
    directClaimSupported,
    claimRequiresVerification,
    isClaimed,
  };
  const { claimBannerVariant, shouldShowClaimBanner } = resolveClaimBannerState(
    { ...bannerInputs, claimSearchParam }
  );
  // A claim link lands on ?claim=1, which only the browser can read. Reserve
  // the room for both copies so the banner never changes height on hydration.
  const alternateVariant = resolveClaimBannerState({
    ...bannerInputs,
    claimSearchParam: claimSearchParam === '1' ? undefined : '1',
  }).claimBannerVariant;

  if (!shouldShowClaimBanner) {
    return null;
  }

  return (
    <ClaimBanner
      profileHandle={profileHandle}
      displayName={displayName}
      prefetch={prefetch}
      variant={claimBannerVariant ?? undefined}
      reserveVariant={alternateVariant ?? undefined}
      trackExposure={locationKnown}
      ctaHref={
        claimBannerVariant === 'unsupported'
          ? undefined
          : claimHrefWithAttribution(
              `/${encodeURIComponent(profileHandle)}/claim?next=auth`,
              new URLSearchParams(locationSearch ?? '')
            )
      }
    />
  );
}
