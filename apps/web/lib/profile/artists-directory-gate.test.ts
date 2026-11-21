import { describe, expect, it } from 'vitest';
import {
  ARTISTS_DIRECTORY_MIN_PROFILES,
  isArtistsDirectoryPublishable,
} from './artists-directory-gate';
import {
  isPrivacyAffectingProfileUpdate,
  isYoungAudienceProfile,
} from './public-profile-access';

describe('artists directory publish gate', () => {
  it('stays closed until there are enough real profiles', () => {
    expect(ARTISTS_DIRECTORY_MIN_PROFILES).toBe(12);
    expect(isArtistsDirectoryPublishable(1)).toBe(false);
    expect(isArtistsDirectoryPublishable(11)).toBe(false);
    expect(isArtistsDirectoryPublishable(null)).toBe(false);
    expect(isArtistsDirectoryPublishable(12)).toBe(true);
  });
});

describe('TRK-6 helpers', () => {
  it('youngAudience and privacy cache gates', () => {
    expect(isYoungAudienceProfile({ youngAudience: true })).toBe(true);
    expect(isYoungAudienceProfile({})).toBe(false);
    expect(
      isPrivacyAffectingProfileUpdate({ settings: { youngAudience: true } })
    ).toBe(true);
    expect(isPrivacyAffectingProfileUpdate({})).toBe(false);
  });
});
