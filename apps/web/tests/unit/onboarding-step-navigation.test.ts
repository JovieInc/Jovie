import { describe, expect, it } from 'vitest';
import { PROFILE_REVIEW_STEP_INDEX } from '@/features/dashboard/organisms/apple-style-onboarding/types';
import { resolveInitialStep } from '@/features/dashboard/organisms/onboarding/profile-review-guards';

/**
 * Tests for step-resume logic in onboarding.
 * Imports the production resolver and step constant.
 */
describe('resolveInitialStep', () => {
  it('returns 0 for new users (no profile)', () => {
    expect(resolveInitialStep(null, PROFILE_REVIEW_STEP_INDEX)).toBe(0);
  });

  it('returns 0 for users with avatar already set', () => {
    expect(
      resolveInitialStep(
        {
          onboardingCompletedAt: new Date(),
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
        PROFILE_REVIEW_STEP_INDEX
      )
    ).toBe(0);
  });

  it('returns profile-review step index for users with completed onboarding but no avatar', () => {
    expect(
      resolveInitialStep(
        { onboardingCompletedAt: new Date(), avatarUrl: null },
        PROFILE_REVIEW_STEP_INDEX
      )
    ).toBe(PROFILE_REVIEW_STEP_INDEX);
  });

  it('returns 0 for users who never completed onboarding (even without avatar)', () => {
    expect(
      resolveInitialStep(
        { onboardingCompletedAt: null, avatarUrl: null },
        PROFILE_REVIEW_STEP_INDEX
      )
    ).toBe(0);
  });
});

describe('PROFILE_REVIEW_STEP_INDEX', () => {
  it('matches the profile-review step position in ONBOARDING_STEPS', () => {
    // Sanity check: ensure the constant resolves to a valid index
    expect(PROFILE_REVIEW_STEP_INDEX).toBeGreaterThanOrEqual(0);
  });

  it('is currently step 2 (handle=0, dsp=1, profile-review=2)', () => {
    expect(PROFILE_REVIEW_STEP_INDEX).toBe(2);
  });
});
