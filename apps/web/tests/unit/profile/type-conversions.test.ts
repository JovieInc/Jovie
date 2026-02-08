/**
 * Unit tests for type conversion utilities.
 *
 * Tests the conversion between CreatorProfile and Artist types,
 * including edge cases around null values, unclaimed profiles,
 * and field mapping correctness.
 */

import { describe, expect, it } from 'vitest';
import {
  type Artist,
  type CreatorProfile,
  convertArtistToCreatorProfile,
  convertCreatorProfileToArtist,
  isArtistProfile,
  isPodcasterProfile,
} from '@/types/db';

const baseProfile: CreatorProfile = {
  id: 'profile-123',
  user_id: 'user-456',
  creator_type: 'artist',
  username: 'testartist',
  display_name: 'Test Artist',
  bio: 'An amazing artist',
  avatar_url: 'https://example.com/avatar.jpg',
  spotify_url: 'https://open.spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: 'https://youtube.com/channel/123',
  spotify_id: 'spotify-123',
  is_public: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  is_claimed: true,
  claim_token: null,
  claimed_at: '2024-01-01T00:00:00Z',
  profile_views: 100,
  username_normalized: 'testartist',
  search_text: 'test artist',
  display_title: 'Test Artist',
  profile_completion_pct: 80,
  settings: { hide_branding: true },
  theme: { primaryColor: '#ff0000' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
};

const baseArtist: Artist = {
  id: 'profile-123',
  owner_user_id: 'user-456',
  handle: 'testartist',
  spotify_id: 'spotify-123',
  name: 'Test Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'An amazing artist',
  theme: { primaryColor: '#ff0000' },
  settings: { hide_branding: true },
  spotify_url: 'https://open.spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: 'https://youtube.com/channel/123',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00Z',
};

describe('convertCreatorProfileToArtist', () => {
  it('maps all fields correctly', () => {
    const artist = convertCreatorProfileToArtist(baseProfile);

    expect(artist.id).toBe(baseProfile.id);
    expect(artist.owner_user_id).toBe(baseProfile.user_id);
    expect(artist.handle).toBe(baseProfile.username);
    expect(artist.spotify_id).toBe(baseProfile.spotify_id);
    expect(artist.name).toBe(baseProfile.display_name);
    expect(artist.image_url).toBe(baseProfile.avatar_url);
    expect(artist.tagline).toBe(baseProfile.bio);
    expect(artist.theme).toEqual(baseProfile.theme);
    expect(artist.settings).toEqual(baseProfile.settings);
    expect(artist.spotify_url).toBe(baseProfile.spotify_url);
    expect(artist.apple_music_url).toBe(baseProfile.apple_music_url);
    expect(artist.youtube_url).toBe(baseProfile.youtube_url);
    expect(artist.published).toBe(baseProfile.is_public);
    expect(artist.is_verified).toBe(baseProfile.is_verified);
    expect(artist.is_featured).toBe(baseProfile.is_featured);
    expect(artist.marketing_opt_out).toBe(baseProfile.marketing_opt_out);
    expect(artist.created_at).toBe(baseProfile.created_at);
  });

  it('handles null user_id for unclaimed profiles', () => {
    const unclaimed = { ...baseProfile, user_id: null };
    const artist = convertCreatorProfileToArtist(unclaimed);

    expect(artist.owner_user_id).toBe('');
  });

  it('uses username as fallback when display_name is null', () => {
    const noName = { ...baseProfile, display_name: null };
    const artist = convertCreatorProfileToArtist(noName);

    expect(artist.name).toBe('testartist');
  });

  it('converts null avatar_url to undefined', () => {
    const noAvatar = { ...baseProfile, avatar_url: null };
    const artist = convertCreatorProfileToArtist(noAvatar);

    expect(artist.image_url).toBeUndefined();
  });

  it('converts null bio to undefined tagline', () => {
    const noBio = { ...baseProfile, bio: null };
    const artist = convertCreatorProfileToArtist(noBio);

    expect(artist.tagline).toBeUndefined();
  });

  it('converts null spotify_id to empty string', () => {
    const noSpotify = { ...baseProfile, spotify_id: null };
    const artist = convertCreatorProfileToArtist(noSpotify);

    expect(artist.spotify_id).toBe('');
  });

  it('converts null theme to undefined', () => {
    const noTheme = { ...baseProfile, theme: null };
    const artist = convertCreatorProfileToArtist(noTheme);

    expect(artist.theme).toBeUndefined();
  });

  it('provides default settings when null', () => {
    const noSettings = { ...baseProfile, settings: null };
    const artist = convertCreatorProfileToArtist(noSettings);

    expect(artist.settings).toEqual({ hide_branding: false });
  });

  it('converts null platform URLs to undefined', () => {
    const noUrls = {
      ...baseProfile,
      spotify_url: null,
      apple_music_url: null,
      youtube_url: null,
    };
    const artist = convertCreatorProfileToArtist(noUrls);

    expect(artist.spotify_url).toBeUndefined();
    expect(artist.apple_music_url).toBeUndefined();
    expect(artist.youtube_url).toBeUndefined();
  });
});

describe('convertArtistToCreatorProfile', () => {
  it('maps all fields correctly (returns Partial)', () => {
    const profile = convertArtistToCreatorProfile(baseArtist);

    expect(profile.user_id).toBe(baseArtist.owner_user_id);
    expect(profile.creator_type).toBe('artist');
    expect(profile.username).toBe(baseArtist.handle);
    expect(profile.display_name).toBe(baseArtist.name);
    expect(profile.bio).toBe(baseArtist.tagline);
    expect(profile.avatar_url).toBe(baseArtist.image_url);
    expect(profile.spotify_url).toBe(baseArtist.spotify_url);
    expect(profile.apple_music_url).toBe(baseArtist.apple_music_url);
    expect(profile.youtube_url).toBe(baseArtist.youtube_url);
    expect(profile.spotify_id).toBe(baseArtist.spotify_id);
    expect(profile.is_public).toBe(baseArtist.published);
    expect(profile.is_verified).toBe(baseArtist.is_verified);
  });

  it('always sets creator_type to artist', () => {
    const profile = convertArtistToCreatorProfile(baseArtist);
    expect(profile.creator_type).toBe('artist');
  });
});

describe('Type Guards', () => {
  describe('isArtistProfile', () => {
    it('returns true for artist profiles', () => {
      expect(isArtistProfile({ ...baseProfile, creator_type: 'artist' })).toBe(
        true
      );
    });

    it('returns false for non-artist profiles', () => {
      expect(
        isArtistProfile({ ...baseProfile, creator_type: 'podcaster' })
      ).toBe(false);
      expect(isArtistProfile({ ...baseProfile, creator_type: 'creator' })).toBe(
        false
      );
    });
  });

  describe('isPodcasterProfile', () => {
    it('returns true for podcaster profiles', () => {
      expect(
        isPodcasterProfile({ ...baseProfile, creator_type: 'podcaster' })
      ).toBe(true);
    });

    it('returns false for non-podcaster profiles', () => {
      expect(
        isPodcasterProfile({ ...baseProfile, creator_type: 'artist' })
      ).toBe(false);
    });
  });
});

describe('Roundtrip Conversion', () => {
  it('preserves key fields through profile -> artist -> profile conversion', () => {
    const artist = convertCreatorProfileToArtist(baseProfile);
    const backToProfile = convertArtistToCreatorProfile(artist);

    expect(backToProfile.username).toBe(baseProfile.username);
    expect(backToProfile.display_name).toBe(baseProfile.display_name);
    expect(backToProfile.bio).toBe(baseProfile.bio);
    expect(backToProfile.spotify_url).toBe(baseProfile.spotify_url);
    expect(backToProfile.is_public).toBe(baseProfile.is_public);
  });
});
