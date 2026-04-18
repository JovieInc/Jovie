import { describe, expect, it } from 'vitest';
import { verifyAvatarPresent } from '@/features/dashboard/organisms/onboarding/profile-review-guards';

/**
 * Tests for the avatar verification logic.
 * Imports the production verifier from profile-review-guards.
 *
 * Note: The server action verifyProfileHasAvatar in update-profile.ts uses 'use server'
 * and can't be imported directly. This tests the shared validation logic it delegates to.
 */
describe('verifyAvatarPresent', () => {
  it('returns avatarUrl when profile has a photo', () => {
    const result = verifyAvatarPresent({
      avatarUrl: 'https://cdn.example.com/avatar.avif',
    });
    expect(result).toEqual({
      avatarUrl: 'https://cdn.example.com/avatar.avif',
    });
  });

  it('throws when profile has no photo', () => {
    expect(() => verifyAvatarPresent({ avatarUrl: null })).toThrow(
      'Profile photo is required'
    );
  });

  it('throws when no profile found', () => {
    expect(() => verifyAvatarPresent(undefined)).toThrow(
      'Profile photo is required'
    );
  });

  it('throws when avatarUrl is empty string', () => {
    expect(() => verifyAvatarPresent({ avatarUrl: '' })).toThrow(
      'Profile photo is required'
    );
  });

  it('throws when avatarUrl is whitespace-only', () => {
    expect(() => verifyAvatarPresent({ avatarUrl: '   ' })).toThrow(
      'Profile photo is required'
    );
  });

  it('trims avatarUrl in return value', () => {
    const result = verifyAvatarPresent({
      avatarUrl: '  https://cdn.example.com/avatar.avif  ',
    });
    expect(result.avatarUrl).toBe('https://cdn.example.com/avatar.avif');
  });
});
