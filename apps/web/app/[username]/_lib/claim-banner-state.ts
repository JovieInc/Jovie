import type { ProfileVisitorState } from '@/lib/claim/types';

export type ClaimBannerVariant =
  | 'organic'
  | 'claim_intent'
  | 'direct_in_progress'
  | 'verified_claim'
  | 'unsupported';

export function resolveClaimBannerState(params: {
  visitorState: ProfileVisitorState;
  claimSearchParam?: string;
  directClaimSupported: boolean;
  claimRequiresVerification?: boolean;
  isClaimed: boolean;
}): {
  claimBannerVariant: ClaimBannerVariant | null;
  shouldShowClaimBanner: boolean;
} {
  const {
    visitorState,
    claimSearchParam,
    directClaimSupported,
    claimRequiresVerification = false,
    isClaimed,
  } = params;

  let claimBannerVariant: ClaimBannerVariant | null = null;

  if (claimRequiresVerification) {
    claimBannerVariant = directClaimSupported
      ? 'verified_claim'
      : 'unsupported';
  } else if (
    visitorState === 'claim_intent_token' ||
    claimSearchParam === '1'
  ) {
    claimBannerVariant = 'claim_intent';
  } else if (visitorState === 'claim_intent_direct') {
    claimBannerVariant = 'direct_in_progress';
  } else if (directClaimSupported) {
    claimBannerVariant = 'organic';
  } else {
    // Never make an unclaimed public profile look artist-owned. Profiles
    // without an exact Spotify identity cannot enter the direct claim flow,
    // but they still need an honest, visible ownership state.
    claimBannerVariant = 'unsupported';
  }

  return {
    claimBannerVariant,
    shouldShowClaimBanner:
      !isClaimed && visitorState !== 'owner' && claimBannerVariant !== null,
  };
}
