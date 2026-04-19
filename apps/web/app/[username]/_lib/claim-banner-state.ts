import type { ProfileVisitorState } from '@/lib/claim/types';

export type ClaimBannerVariant =
  | 'organic'
  | 'claim_intent'
  | 'direct_in_progress'
  | 'unsupported';

export function resolveClaimBannerState(params: {
  visitorState: ProfileVisitorState;
  claimSearchParam?: string;
  directClaimSupported: boolean;
  isClaimed: boolean;
}): {
  claimBannerVariant: ClaimBannerVariant | null;
  shouldShowClaimBanner: boolean;
} {
  const { visitorState, claimSearchParam, directClaimSupported, isClaimed } =
    params;

  let claimBannerVariant: ClaimBannerVariant | null = null;

  if (visitorState === 'claim_intent_token' || claimSearchParam === '1') {
    claimBannerVariant = 'claim_intent';
  } else if (visitorState === 'claim_intent_direct') {
    claimBannerVariant = 'direct_in_progress';
  } else if (claimSearchParam === 'unsupported' && !directClaimSupported) {
    claimBannerVariant = 'unsupported';
  } else if (directClaimSupported) {
    claimBannerVariant = 'organic';
  }

  return {
    claimBannerVariant,
    shouldShowClaimBanner:
      !isClaimed && visitorState !== 'owner' && claimBannerVariant !== null,
  };
}
