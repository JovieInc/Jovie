import { describe, expect, it } from 'vitest';
import { getPublicProfileIdentityExclusionReason } from '@/lib/profile/public-profile-identity-policy';
import {
  CANARY_SEED_IDENTITIES,
  type CanaryProfileSnapshot,
  CHAT_HEALTH_CANARY_SEED,
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
  isPublic: true,
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

  it('republishes an unpublished chat-health canary so /app stays reachable', () => {
    const unpublished: CanaryProfileSnapshot = {
      profileId: 'p2',
      ownerEmail: CHAT_HEALTH_CANARY_SEED.email,
      username: CHAT_HEALTH_CANARY_SEED.handle,
      displayName: CHAT_HEALTH_CANARY_SEED.displayName,
      bio: CHAT_HEALTH_CANARY_SEED.bio,
      spotifyId: null,
      spotifyUrl: null,
      avatarUrl: null,
      isPublic: false,
    };
    expect(
      planCanaryProfileUpdate(CHAT_HEALTH_CANARY_SEED, unpublished, null, false)
    ).toEqual([
      {
        table: 'creator_profiles',
        key: { id: 'p2' },
        set: { is_public: true },
      },
    ]);
    expect(
      planCanaryProfileUpdate(
        CHAT_HEALTH_CANARY_SEED,
        { ...unpublished, isPublic: true },
        null,
        false
      )
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
});
