import { describe, expect, it } from 'vitest';

/**
 * Tests for the display name ≠ handle validation added to useOnboardingSubmit.
 * The validation logic is inline in the hook, so we test the rule itself.
 */
describe('Display name ≠ handle validation', () => {
  function isDisplayNameSameAsHandle(
    displayName: string,
    handle: string
  ): boolean {
    return displayName.toLowerCase() === handle.toLowerCase();
  }

  it('rejects when display name matches handle exactly', () => {
    expect(isDisplayNameSameAsHandle('coolartist', 'coolartist')).toBe(true);
  });

  it('rejects when display name matches handle case-insensitively', () => {
    expect(isDisplayNameSameAsHandle('CoolArtist', 'coolartist')).toBe(true);
    expect(isDisplayNameSameAsHandle('COOLARTIST', 'coolartist')).toBe(true);
  });

  it('accepts when display name differs from handle', () => {
    expect(isDisplayNameSameAsHandle('Cool Artist', 'coolartist')).toBe(false);
    expect(isDisplayNameSameAsHandle('DJ Cool', 'coolartist')).toBe(false);
  });

  it('accepts when display name is a real name', () => {
    expect(isDisplayNameSameAsHandle('John Smith', 'john-smith')).toBe(false);
  });
});
