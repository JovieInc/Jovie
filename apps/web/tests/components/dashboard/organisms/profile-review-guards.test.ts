import { describe, expect, it } from 'vitest';
import { canProceedFromProfileReview } from '@/components/dashboard/organisms/onboarding/profile-review-guards';

describe('canProceedFromProfileReview', () => {
  it('returns false when display name is missing', () => {
    expect(
      canProceedFromProfileReview('   ', 'https://cdn.jovie.test/avatar.png')
    ).toBe(false);
  });

  it('returns false when avatar is missing', () => {
    expect(canProceedFromProfileReview('Artist Name', null)).toBe(false);
  });

  it('returns true when display name and avatar are both present', () => {
    expect(
      canProceedFromProfileReview(
        'Artist Name',
        'https://cdn.jovie.test/avatar.png'
      )
    ).toBe(true);
  });
});
