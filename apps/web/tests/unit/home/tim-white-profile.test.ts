import { describe, expect, it } from 'vitest';
import { buildDemoProfile } from '@/features/demo/mock-dashboard-data';
import { MOCK_ARTIST } from '@/features/home/phone-mode-content';
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

  it('keeps the demo profile fallback aligned with the canonical profile', () => {
    const demoProfile = buildDemoProfile();

    expect(demoProfile.username).toBe(TIM_WHITE_PROFILE.handle);
    expect(demoProfile.displayName).toBe(TIM_WHITE_PROFILE.name);
    expect(demoProfile.avatarUrl).toBe(TIM_WHITE_PROFILE.avatarSrc);
    expect(demoProfile.spotifyId).toBe(TIM_WHITE_SPOTIFY_ID);
    expect(demoProfile.spotifyUrl).toBe(TIM_WHITE_PROFILE.spotifyUrl);
  });
});
