import { describe, expect, it } from 'vitest';
import {
  isProfileComplete,
  type ProfileCompletenessFields,
} from '@/lib/auth/profile-completeness';

function makeProfile(
  overrides: Partial<ProfileCompletenessFields> = {}
): ProfileCompletenessFields {
  return {
    username: 'tim',
    usernameNormalized: 'tim',
    displayName: 'Tim White',
    isPublic: true,
    onboardingCompletedAt: new Date('2026-03-19T17:56:33.757Z'),
    hasVisibleRelease: true,
    ...overrides,
  };
}

describe('isProfileComplete', () => {
  it('returns true when all fields are present and valid', () => {
    expect(isProfileComplete(makeProfile())).toBe(true);
  });

  it('returns false when username is null', () => {
    expect(isProfileComplete(makeProfile({ username: null }))).toBe(false);
  });

  it('returns false when username is empty string', () => {
    expect(isProfileComplete(makeProfile({ username: '' }))).toBe(false);
  });

  it('returns false when username is whitespace only', () => {
    expect(isProfileComplete(makeProfile({ username: '   ' }))).toBe(false);
  });

  it('returns false when usernameNormalized is null', () => {
    expect(isProfileComplete(makeProfile({ usernameNormalized: null }))).toBe(
      false
    );
  });

  it('returns false when displayName is null', () => {
    expect(isProfileComplete(makeProfile({ displayName: null }))).toBe(false);
  });

  it('returns false when displayName is empty string', () => {
    expect(isProfileComplete(makeProfile({ displayName: '' }))).toBe(false);
  });

  it('returns false when displayName is whitespace only', () => {
    expect(isProfileComplete(makeProfile({ displayName: '   ' }))).toBe(false);
  });

  it('returns false when isPublic is false', () => {
    expect(isProfileComplete(makeProfile({ isPublic: false }))).toBe(false);
  });

  it('returns true when isPublic is null (default public)', () => {
    expect(isProfileComplete(makeProfile({ isPublic: null }))).toBe(true);
  });

  it('returns false when onboardingCompletedAt is null', () => {
    expect(
      isProfileComplete(makeProfile({ onboardingCompletedAt: null }))
    ).toBe(false);
  });

  it('returns false when hasVisibleRelease is false', () => {
    expect(isProfileComplete(makeProfile({ hasVisibleRelease: false }))).toBe(
      false
    );
  });

  it('returns false when hasVisibleRelease is null', () => {
    expect(isProfileComplete(makeProfile({ hasVisibleRelease: null }))).toBe(
      false
    );
  });

  it('returns true when hasVisibleRelease is omitted', () => {
    expect(
      isProfileComplete(makeProfile({ hasVisibleRelease: undefined }))
    ).toBe(true);
  });
});
