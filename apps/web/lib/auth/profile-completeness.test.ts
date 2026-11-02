import { describe, expect, it } from 'vitest';
import { isProfileComplete } from './profile-completeness';

const complete = {
  username: 'artist',
  usernameNormalized: 'artist',
  displayName: 'Artist',
  isPublic: true,
  onboardingCompletedAt: new Date('2026-10-01T00:00:00.000Z'),
};

describe('isProfileComplete', () => {
  it('requires a public page for an ordinary profile', () => {
    expect(isProfileComplete(complete)).toBe(true);
    expect(isProfileComplete({ ...complete, isPublic: false })).toBe(false);
  });

  it('treats a private page waiting for ownership proof as complete, so the artist keeps using the product', () => {
    expect(
      isProfileComplete({ ...complete, isPublic: false, proofPending: true })
    ).toBe(true);
  });

  it('still needs a finished onboarding even while proof is pending', () => {
    expect(
      isProfileComplete({
        ...complete,
        isPublic: false,
        proofPending: true,
        onboardingCompletedAt: null,
      })
    ).toBe(false);
  });
});
