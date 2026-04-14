'use client';

import { useSearchParams } from 'next/navigation';
import { ClaimBanner } from '@/features/profile/ClaimBanner';
import type { ProfileVisitorState } from '@/lib/claim/types';
import { resolveClaimBannerState } from '../_lib/claim-banner-state';

interface PublicClaimBannerProps {
  readonly profileHandle: string;
  readonly displayName: string;
  readonly directClaimSupported: boolean;
  readonly isClaimed: boolean;
  readonly visitorState: ProfileVisitorState;
}

export function PublicClaimBanner({
  profileHandle,
  displayName,
  directClaimSupported,
  isClaimed,
  visitorState,
}: PublicClaimBannerProps) {
  const searchParams = useSearchParams();
  const claimSearchParam = searchParams.get('claim') ?? undefined;
  const { claimBannerVariant, shouldShowClaimBanner } = resolveClaimBannerState(
    {
      visitorState,
      claimSearchParam,
      directClaimSupported,
      isClaimed,
    }
  );

  if (!shouldShowClaimBanner) {
    return null;
  }

  return (
    <ClaimBanner
      profileHandle={profileHandle}
      displayName={displayName}
      variant={claimBannerVariant ?? undefined}
      ctaHref={
        claimBannerVariant === 'unsupported'
          ? undefined
          : `/${encodeURIComponent(profileHandle)}/claim?next=auth`
      }
    />
  );
}
