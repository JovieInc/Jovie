import { describe, expect, it } from 'vitest';
import {
  ARTISTS_DIRECTORY_MIN_PROFILES,
  isArtistsDirectoryPublishable,
} from './artists-directory-gate';

describe('artists directory publish gate', () => {
  it('stays closed until there are enough real profiles', () => {
    expect(ARTISTS_DIRECTORY_MIN_PROFILES).toBe(12);
    expect(isArtistsDirectoryPublishable(1)).toBe(false);
    expect(isArtistsDirectoryPublishable(11)).toBe(false);
    expect(isArtistsDirectoryPublishable(null)).toBe(false);
    expect(isArtistsDirectoryPublishable(12)).toBe(true);
  });
});
