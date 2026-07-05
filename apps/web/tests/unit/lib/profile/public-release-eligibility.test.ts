import { describe, expect, it } from 'vitest';
import {
  hasPublicReleaseArtwork,
  isPublicReleaseEligible,
} from '@/lib/profile/public-release-eligibility';
import { DATES, FIXED_NOW } from '../../fixtures/release-dates';

const ARTWORK_URL = 'https://cdn.jov.ie/releases/test-artwork.jpg';

function eligibleRelease(
  overrides: Partial<{
    releaseDate: Date | string | null;
    revealDate: Date | string | null;
    artworkUrl: string | null;
    status: string | null;
    deletedAt: Date | string | null;
    hasProviderLinks: boolean;
    approvalStatus:
      | 'draft'
      | 'needs_review'
      | 'approved'
      | 'archived'
      | undefined;
  }> = {}
) {
  return {
    releaseDate: DATES.recentRelease,
    revealDate: DATES.pastReveal,
    artworkUrl: ARTWORK_URL,
    hasProviderLinks: true,
    approvalStatus: 'approved' as const,
    ...overrides,
  };
}

describe('isPublicReleaseEligible', () => {
  const now = FIXED_NOW;

  it('allows approved releases that meet the public gate', () => {
    expect(isPublicReleaseEligible(eligibleRelease(), now)).toBe(true);
  });

  it('hides draft library approval statuses from public surfaces', () => {
    expect(
      isPublicReleaseEligible(eligibleRelease({ approvalStatus: 'draft' }), now)
    ).toBe(false);
  });

  it('hides needs_review library approval statuses from public surfaces', () => {
    expect(
      isPublicReleaseEligible(
        eligibleRelease({ approvalStatus: 'needs_review' }),
        now
      )
    ).toBe(false);
  });

  it('hides archived library approval statuses from public surfaces', () => {
    expect(
      isPublicReleaseEligible(
        eligibleRelease({ approvalStatus: 'archived' }),
        now
      )
    ).toBe(false);
  });

  it('skips approval checks when approval status is omitted', () => {
    expect(
      isPublicReleaseEligible(
        eligibleRelease({ approvalStatus: undefined }),
        now
      )
    ).toBe(true);
  });

  it('still hides discog draft releases even when approved', () => {
    expect(
      isPublicReleaseEligible(
        eligibleRelease({ status: 'draft', approvalStatus: 'approved' }),
        now
      )
    ).toBe(false);
  });
});

describe('hasPublicReleaseArtwork', () => {
  it('requires non-empty artwork URLs', () => {
    expect(hasPublicReleaseArtwork(ARTWORK_URL)).toBe(true);
    expect(hasPublicReleaseArtwork('   ')).toBe(false);
    expect(hasPublicReleaseArtwork(null)).toBe(false);
  });
});
