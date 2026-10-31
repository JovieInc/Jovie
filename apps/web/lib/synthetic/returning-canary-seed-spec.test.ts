import { describe, expect, it } from 'vitest';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { getPublicProfileIdentityExclusionReason } from '@/lib/profile/public-profile-identity-policy';
import {
  CANARY_SEED_IDENTITIES,
  type CanaryProfileSnapshot,
  CHAT_HEALTH_CANARY_SEED,
  chatHealthCanaryProfileSeedInput,
  isCanarySeedEmail,
  planCanaryProfileUpdate,
  RETURNING_CANARY_SEED,
} from './returning-canary-seed-spec';

const legacy: CanaryProfileSnapshot = {
  profileId: 'p1',
  ownerEmail: RETURNING_CANARY_SEED.email,
  username: 'browse-ready-user',
  displayName: 'Browse Ready User',
  bio: 'Stable creator profile with a publishable baseline for perf measurement.',
  spotifyId: null,
  spotifyUrl: 'https://open.spotify.com/artist/4NHQUkpP4uKj7LKEMstSxN',
  avatarUrl: '/avatars/default-user.png',
};
const artist = {
  imageUrl: 'https://i.scdn.co/image/abc',
  genres: ['rock'],
  followerCount: 10,
  popularity: 5,
};

describe('returning canary seed spec', () => {
  it('binds a real pool artist, not the fake "Browse Ready User"', () => {
    expect(RETURNING_CANARY_SEED.displayName).toBe('Good Dropouts');
    expect(RETURNING_CANARY_SEED.displayName).not.toMatch(/browse|ready/i);
    expect(RETURNING_CANARY_SEED.artist?.spotifyId).toBe(
      '6knM2BGm18cXek6FXbWd0t'
    );
  });

  it('plans exactly the profile writes and nothing else', () => {
    const [update] = planCanaryProfileUpdate(
      RETURNING_CANARY_SEED,
      legacy,
      artist,
      false
    );
    expect(update.table).toBe('creator_profiles');
    expect(update.key).toEqual({ id: 'p1' });
    expect(Object.keys(update.set).sort()).toEqual(
      [
        'avatar_url',
        'bio',
        'display_name',
        'spotify_id',
        'spotify_url',
        'username',
        'username_normalized',
      ].sort()
    );
  });

  it('is idempotent: a converged profile plans no writes', () => {
    const converged: CanaryProfileSnapshot = {
      ...legacy,
      username: RETURNING_CANARY_SEED.handle,
      displayName: RETURNING_CANARY_SEED.displayName,
      bio: RETURNING_CANARY_SEED.bio,
      spotifyId: RETURNING_CANARY_SEED.artist?.spotifyId ?? null,
      spotifyUrl: RETURNING_CANARY_SEED.artist?.url ?? null,
      avatarUrl: artist.imageUrl,
    };
    expect(
      planCanaryProfileUpdate(RETURNING_CANARY_SEED, converged, artist, false)
    ).toEqual([]);
  });

  it('refuses a profile owned by anyone but the canary', () => {
    expect(() =>
      planCanaryProfileUpdate(
        RETURNING_CANARY_SEED,
        { ...legacy, ownerEmail: 'someone@customer.com' },
        artist,
        false
      )
    ).toThrow(/not owned/);
  });

  it('refuses to steal a Spotify id bound to another profile', () => {
    expect(() =>
      planCanaryProfileUpdate(RETURNING_CANARY_SEED, legacy, artist, true)
    ).toThrow(/bound to another/);
  });

  it('only whitelists the two canary emails', () => {
    expect(CANARY_SEED_IDENTITIES).toHaveLength(2);
    expect(isCanarySeedEmail('real.artist@gmail.com')).toBe(false);
    expect(isCanarySeedEmail(RETURNING_CANARY_SEED.email)).toBe(true);
  });

  it('seeded handles are reserved as production canaries (noindex, unclaimable)', () => {
    for (const { handle } of CANARY_SEED_IDENTITIES) {
      expect(getPublicProfileIdentityExclusionReason(handle)).toBe(
        'production_canary'
      );
    }
  });

  it('chat-health canary seeds a COMPLETE profile, so the chat shell never redirects it to /start (JOV-10150)', () => {
    const seededAt = new Date('2026-10-31T00:00:00.000Z');
    const input = chatHealthCanaryProfileSeedInput(seededAt);

    // The exact gate that broke the post-deploy chat cert: DashboardShellContent
    // redirects every chat route (including /app/chat) to /start while
    // isProfileComplete is false, and the /start onboarding composer renders
    // the same 'Chat Message Input' textarea with NO attach toolbar.
    expect(
      isProfileComplete({
        username: input.username,
        usernameNormalized: input.usernameNormalized,
        displayName: input.displayName,
        isPublic: input.isPublic,
        onboardingCompletedAt: input.onboardingCompletedAt,
      })
    ).toBe(true);

    // The seeded identity is the spec's own, and the profile is claimed and
    // public — a real publishable profile, not an onboarding-pending shell.
    expect(input.username).toBe(CHAT_HEALTH_CANARY_SEED.handle);
    expect(input.usernameNormalized).toBe(CHAT_HEALTH_CANARY_SEED.handle);
    expect(input.displayName).toBe(CHAT_HEALTH_CANARY_SEED.displayName);
    expect(input.bio).toBe(CHAT_HEALTH_CANARY_SEED.bio);
    expect(input.isPublic).toBe(true);
    expect(input.isClaimed).toBe(true);
    expect(input.onboardingCompletedAt).toBe(seededAt);
  });
});
