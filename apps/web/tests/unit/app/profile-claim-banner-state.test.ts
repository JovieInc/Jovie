import { describe, expect, it } from 'vitest';
import { resolveClaimBannerState } from '@/app/[username]/_lib/claim-banner-state';

describe('resolveClaimBannerState', () => {
  it('returns claim_intent when the claim query flag is present', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'organic_unclaimed',
        claimSearchParam: '1',
        directClaimSupported: true,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'claim_intent',
      shouldShowClaimBanner: true,
    });
  });

  it('returns direct_in_progress for direct claim intent visitors', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'claim_intent_direct',
        directClaimSupported: true,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'direct_in_progress',
      shouldShowClaimBanner: true,
    });
  });

  it('returns unsupported when direct claim is unavailable and requested', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'organic_unclaimed',
        claimSearchParam: 'unsupported',
        directClaimSupported: false,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'unsupported',
      shouldShowClaimBanner: true,
    });
  });

  it('returns organic for direct-claim-supported public visitors', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'organic_unclaimed',
        directClaimSupported: true,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'organic',
      shouldShowClaimBanner: true,
    });
  });

  it('hides the banner for owners', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'owner',
        directClaimSupported: true,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'organic',
      shouldShowClaimBanner: false,
    });
  });

  it('hides the banner for claimed profiles', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'claimed_public',
        directClaimSupported: true,
        isClaimed: true,
      })
    ).toEqual({
      claimBannerVariant: 'organic',
      shouldShowClaimBanner: false,
    });
  });

  it('falls back to the organic banner for invalid pending-claim contexts', () => {
    expect(
      resolveClaimBannerState({
        visitorState: 'claim_invalid',
        directClaimSupported: true,
        isClaimed: false,
      })
    ).toEqual({
      claimBannerVariant: 'organic',
      shouldShowClaimBanner: true,
    });
  });
});
