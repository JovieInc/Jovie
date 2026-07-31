import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY_PROFILE_VISIBILITY,
  isLibraryAssetVisibleOnProfile,
  isLibraryProfileVisibility,
} from './profile-visibility';

describe('Library profile visibility', () => {
  it('accepts only canonical visibility states', () => {
    expect(isLibraryProfileVisibility('visible')).toBe(true);
    expect(isLibraryProfileVisibility('hidden')).toBe(true);
    expect(isLibraryProfileVisibility('public')).toBe(false);
    expect(isLibraryProfileVisibility('private')).toBe(false);
    expect(isLibraryProfileVisibility('approved')).toBe(false);
  });

  it('defaults absent legacy rows to visible', () => {
    expect(DEFAULT_LIBRARY_PROFILE_VISIBILITY).toBe('visible');
    expect(isLibraryAssetVisibleOnProfile(undefined)).toBe(true);
    expect(isLibraryAssetVisibleOnProfile(null)).toBe(true);
  });

  it('only hides explicitly hidden entities', () => {
    expect(isLibraryAssetVisibleOnProfile('visible')).toBe(true);
    expect(isLibraryAssetVisibleOnProfile('hidden')).toBe(false);
  });
});
