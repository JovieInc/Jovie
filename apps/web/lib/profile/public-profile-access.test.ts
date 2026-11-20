import { describe, expect, it } from 'vitest';
import {
  isPrivacyAffectingProfileUpdate,
  isProfileSearchable,
  isPublicProfilePublished,
  isYoungAudienceProfile,
} from './public-profile-access';

describe('isYoungAudienceProfile', () => {
  it('is false when settings are missing or malformed', () => {
    expect(isYoungAudienceProfile(undefined)).toBe(false);
    expect(isYoungAudienceProfile(null)).toBe(false);
    expect(isYoungAudienceProfile('yes')).toBe(false);
    expect(isYoungAudienceProfile([])).toBe(false);
    expect(isYoungAudienceProfile({})).toBe(false);
  });

  it('is true only for an explicit true flag', () => {
    expect(isYoungAudienceProfile({ youngAudience: true })).toBe(true);
    expect(isYoungAudienceProfile({ youngAudience: false })).toBe(false);
    expect(isYoungAudienceProfile({ youngAudience: 'true' })).toBe(false);
    expect(isYoungAudienceProfile({ youngAudience: 1 })).toBe(false);
  });
});

describe('isProfileSearchable', () => {
  it('defaults to searchable when the choice is absent', () => {
    expect(isProfileSearchable(undefined)).toBe(true);
    expect(isProfileSearchable({})).toBe(true);
  });

  it('honors an explicit false', () => {
    expect(isProfileSearchable({ searchable: false })).toBe(false);
  });
});

describe('isPublicProfilePublished', () => {
  it('accepts canonical true encodings only', () => {
    expect(isPublicProfilePublished(true)).toBe(true);
    expect(isPublicProfilePublished(1)).toBe(true);
    expect(isPublicProfilePublished('t')).toBe(true);
    expect(isPublicProfilePublished(false)).toBe(false);
    expect(isPublicProfilePublished('true')).toBe(false);
  });
});

describe('isPrivacyAffectingProfileUpdate', () => {
  it('is false for unrelated or empty updates', () => {
    expect(isPrivacyAffectingProfileUpdate({})).toBe(false);
    expect(isPrivacyAffectingProfileUpdate({ settings: {} })).toBe(false);
    expect(isPrivacyAffectingProfileUpdate({ settings: null })).toBe(false);
  });

  it('hard-expires on isPublic, searchable, or youngAudience', () => {
    expect(isPrivacyAffectingProfileUpdate({ isPublic: false })).toBe(true);
    expect(
      isPrivacyAffectingProfileUpdate({ settings: { searchable: false } })
    ).toBe(true);
    expect(
      isPrivacyAffectingProfileUpdate({ settings: { youngAudience: true } })
    ).toBe(true);
    expect(
      isPrivacyAffectingProfileUpdate({ settings: { youngAudience: false } })
    ).toBe(true);
  });
});
