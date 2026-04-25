import { describe, expect, it } from 'vitest';
import {
  onboardingProfileIsReady,
  spotifyImportIsReady,
} from '@/tests/e2e/helpers/e2e-helpers';

describe('e2e helper state checks', () => {
  it('requires a visible release before the onboarding profile is launch-ready', () => {
    expect(
      onboardingProfileIsReady({
        id: 'profile_123',
        spotify_url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
        spotify_id: '6M2wZ9GZgrQXHCFfjv46we',
        is_public: true,
        avatar_url: null,
        onboarding_completed_at: '2026-04-08T22:19:34.005Z',
        spotify_import_status: 'failed',
        release_count: 0,
        spotify_release_link_count: 0,
      })
    ).toBe(false);
  });

  it('still requires persisted releases for spotify import readiness', () => {
    expect(
      spotifyImportIsReady({
        id: 'profile_123',
        spotify_url: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
        spotify_id: '6M2wZ9GZgrQXHCFfjv46we',
        is_public: true,
        avatar_url: null,
        onboarding_completed_at: '2026-04-08T22:19:34.005Z',
        spotify_import_status: 'failed',
        release_count: 0,
        spotify_release_link_count: 0,
      })
    ).toBe(false);
  });
});
