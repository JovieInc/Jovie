import { describe, expect, it } from 'vitest';
import {
  getNotFoundCopy,
  NOT_FOUND_COPY,
  resolveNotFoundVariant,
} from '@/lib/routing/not-found-context';

describe('resolveNotFoundVariant', () => {
  it('treats valid single-segment handle misses as profile misses', () => {
    expect(resolveNotFoundVariant('/nonexistent-artist')).toBe('profile-miss');
    expect(resolveNotFoundVariant('/missing-qa-user')).toBe('profile-miss');
  });

  it('treats invalid or reserved single-segment paths as generic misses', () => {
    expect(resolveNotFoundVariant('/ab')).toBe('generic');
    expect(resolveNotFoundVariant('/register')).toBe('generic');
    expect(resolveNotFoundVariant('/artist-profiles')).toBe('generic');
    expect(resolveNotFoundVariant('/pricing')).toBe('generic');
  });

  it('treats multi-segment paths as generic misses', () => {
    expect(resolveNotFoundVariant('/timwhite/missing-release')).toBe('generic');
    expect(resolveNotFoundVariant('/timwhite/extra/deep/path')).toBe('generic');
  });
});

describe('getNotFoundCopy', () => {
  it('returns profile-specific copy for profile misses', () => {
    expect(getNotFoundCopy('profile-miss')).toEqual(
      NOT_FOUND_COPY['profile-miss']
    );
    expect(getNotFoundCopy('profile-miss').title).toBe('Profile not found');
    expect(getNotFoundCopy('profile-miss').description).toContain(
      "doesn't exist"
    );
  });

  it('returns generic copy for non-profile misses', () => {
    expect(getNotFoundCopy('generic')).toEqual(NOT_FOUND_COPY.generic);
    expect(getNotFoundCopy('generic').title).toBe("We can't find that page.");
  });
});
