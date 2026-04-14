import { describe, expect, it } from 'vitest';
import { buildDemoProfile } from '@/features/demo/mock-dashboard-data';
import { HOME_PAGE_ARTIST } from '@/features/home/home-page-content';
import { HOMEPAGE_PROFILE_PREVIEW_ARTIST } from '@/features/home/homepage-profile-preview-fixture';
import { MOCK_ARTIST } from '@/features/home/phone-mode-content';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

describe('Tim White canonical mock identity', () => {
  it('uses the founder mockup avatar and canonical Spotify identity', () => {
    expect(TIM_WHITE_PROFILE.avatarSrc).toBe(
      '/images/avatars/tim-white-founder.jpg'
    );
    expect(TIM_WHITE_PROFILE.spotifyArtistId).toBe(TIM_WHITE_SPOTIFY_ID);
    expect(TIM_WHITE_PROFILE.spotifyUrl).toBe(
      `https://open.spotify.com/artist/${TIM_WHITE_SPOTIFY_ID}`
    );
  });

  it('keeps the homepage phone mock content aligned with the canonical profile', () => {
    expect(MOCK_ARTIST.name).toBe(TIM_WHITE_PROFILE.name);
    expect(MOCK_ARTIST.handle).toBe(TIM_WHITE_PROFILE.handle);
    expect(MOCK_ARTIST.image).toBe(TIM_WHITE_PROFILE.avatarSrc);
  });

  it('keeps the new homepage story artist aligned with the canonical profile', () => {
    expect(HOME_PAGE_ARTIST.name).toBe(TIM_WHITE_PROFILE.name);
    expect(HOME_PAGE_ARTIST.handle).toBe(TIM_WHITE_PROFILE.handle);
    expect(HOME_PAGE_ARTIST.avatarSrc).toBe(TIM_WHITE_PROFILE.avatarSrc);
  });

  it('keeps the homepage real-profile fixture aligned with the canonical profile', () => {
    expect(HOMEPAGE_PROFILE_PREVIEW_ARTIST.name).toBe(TIM_WHITE_PROFILE.name);
    expect(HOMEPAGE_PROFILE_PREVIEW_ARTIST.handle).toBe(
      TIM_WHITE_PROFILE.handle
    );
    expect(HOMEPAGE_PROFILE_PREVIEW_ARTIST.image_url).toBe(
      TIM_WHITE_PROFILE.avatarSrc
    );
    expect(HOMEPAGE_PROFILE_PREVIEW_ARTIST.spotify_id).toBe(
      TIM_WHITE_PROFILE.spotifyArtistId
    );
  });

  it('keeps the internal demo profile aligned with the canonical internal persona', () => {
    const demoProfile = buildDemoProfile();

    expect(demoProfile.username).toBe(INTERNAL_DJ_DEMO_PERSONA.profile.handle);
    expect(demoProfile.displayName).toBe(
      INTERNAL_DJ_DEMO_PERSONA.profile.displayName
    );
    expect(demoProfile.avatarUrl).toBe(
      INTERNAL_DJ_DEMO_PERSONA.profile.avatarSrc
    );
    expect(demoProfile.spotifyId).toBe(
      INTERNAL_DJ_DEMO_PERSONA.profile.spotifyArtistId
    );
    expect(demoProfile.spotifyUrl).toBe(
      INTERNAL_DJ_DEMO_PERSONA.profile.spotifyUrl
    );
  });
});
