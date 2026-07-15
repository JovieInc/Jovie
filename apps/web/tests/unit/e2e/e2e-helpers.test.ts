import { describe, expect, it } from 'vitest';
import {
  isStaleGoldenPathTestUser,
  onboardingProfileIsReady,
  spotifyImportIsReady,
} from '@/tests/e2e/helpers/e2e-helpers';

describe('e2e helper state checks', () => {
  const now = Date.parse('2026-07-15T08:00:00Z');

  it('only purges golden-path users older than an active job window', () => {
    const user = {
      id: 'user_gp',
      created_at: now - 61 * 60 * 1000,
      email_addresses: [
        { email_address: 'gp-run-1+clerk_test@test.jovie.com' },
      ],
    };

    expect(isStaleGoldenPathTestUser(user, now)).toBe(true);
    expect(
      isStaleGoldenPathTestUser(
        { ...user, created_at: now - 25 * 60 * 1000 },
        now
      )
    ).toBe(false);
    expect(
      isStaleGoldenPathTestUser(
        {
          ...user,
          email_addresses: [
            { email_address: 'person+clerk_test@test.jovie.com' },
          ],
        },
        now
      )
    ).toBe(false);
  });

  it('treats onboarding profile linkage as ready before release import settles', () => {
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
    ).toBe(true);
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
