import { describe, expect, it } from 'vitest';
import { validateDisplayName } from '@/features/dashboard/organisms/onboarding/profile-review-guards';

/**
 * Tests for the display name validation used in the onboarding profile review step.
 * Imports the production validator from profile-review-guards.
 */
describe('validateDisplayName', () => {
  it('rejects when display name matches handle exactly', () => {
    expect(validateDisplayName('coolartist', 'coolartist')).toBe(
      'Please use your artist or real name, not your handle'
    );
  });

  it('rejects when display name matches handle case-insensitively', () => {
    expect(validateDisplayName('CoolArtist', 'coolartist')).toBe(
      'Please use your artist or real name, not your handle'
    );
    expect(validateDisplayName('COOLARTIST', 'coolartist')).toBe(
      'Please use your artist or real name, not your handle'
    );
  });

  it('accepts when display name differs from handle', () => {
    expect(validateDisplayName('Cool Artist', 'coolartist')).toBeNull();
    expect(validateDisplayName('DJ Cool', 'coolartist')).toBeNull();
  });

  it('accepts when display name is a real name', () => {
    expect(validateDisplayName('John Smith', 'john-smith')).toBeNull();
  });

  it('rejects empty display name', () => {
    expect(validateDisplayName('', 'coolartist')).toBe(
      'Display name is required'
    );
  });

  it('rejects whitespace-only display name', () => {
    expect(validateDisplayName('   ', 'coolartist')).toBe(
      'Display name is required'
    );
  });

  it('rejects display name exceeding max length', () => {
    const longName = 'A'.repeat(51);
    expect(validateDisplayName(longName, 'coolartist')).toBe(
      'Must be 50 characters or less'
    );
  });

  it('accepts display name at exactly max length', () => {
    const maxName = 'A'.repeat(50);
    expect(validateDisplayName(maxName, 'coolartist')).toBeNull();
  });
});
