/**
 * Unit tests for the avatar verification logic used in verifyProfileHasAvatar.
 *
 * The actual server action (in update-profile.ts) can't be imported directly
 * in tests due to the 'use server' directive. These tests validate the core
 * decision logic that the server action implements.
 */

import { describe, expect, it } from 'vitest';

/**
 * Mirrors the verification logic from verifyProfileHasAvatar:
 * - If no profile found or avatarUrl is null → throw
 * - Otherwise → return the avatarUrl
 */
function verifyAvatarPresent(
  profile: { avatarUrl: string | null } | undefined
): { avatarUrl: string } {
  if (!profile?.avatarUrl) {
    throw new Error('Profile photo is required');
  }
  return { avatarUrl: profile.avatarUrl };
}

describe('verifyProfileHasAvatar logic', () => {
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
    // Empty string is falsy — should also be rejected
    expect(() => verifyAvatarPresent({ avatarUrl: '' })).toThrow(
      'Profile photo is required'
    );
  });
});
