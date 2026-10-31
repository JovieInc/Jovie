import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  upsert: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));
vi.mock('@/lib/db', () => {
  const chain = () => {
    const rows = mocks.selectRows.shift() ?? [];
    const query: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit'])
      query[method] = () => query;
    query.then = (resolve: (value: unknown) => unknown) => resolve(rows);
    return query;
  };
  return {
    db: {
      select: chain,
      insert: () => ({
        values: (value: unknown) => ({
          onConflictDoUpdate: (config: unknown) => mocks.upsert(value, config),
        }),
      }),
    },
  };
});

const {
  ARTIST_IDENTITY_CHECK_SOURCE,
  getArtistIdentityConfidence,
  requestArtistIdentityConfirmation,
} = await import('./artist-identity-confidence.server');

const profile = {
  id: 'p1',
  displayName: 'Niclas Gustafsson',
  spotifyId: '4c9apHO3XHsvO1KyuwH0Rw',
  spotifyUrl: null,
  appleMusicId: null,
  deezerId: null,
  tidalId: null,
  soundcloudId: null,
  youtubeMusicId: null,
  musicbrainzId: null,
};

describe('artist identity confidence server adapter', () => {
  beforeEach(() => {
    mocks.selectRows.length = 0;
    mocks.upsert.mockReset();
  });

  it('scores a picked artist with no evidence as needing confirmation', async () => {
    mocks.selectRows.push([profile], [], [{ count: 0 }]);
    const identity = await getArtistIdentityConfidence('p1');
    expect(identity).toMatchObject({
      profileId: 'p1',
      decision: 'needs_confirmation',
    });
  });

  it('returns null for an unknown profile', async () => {
    mocks.selectRows.push([]);
    expect(await getArtistIdentityConfidence('missing')).toBeNull();
  });

  it('asks the owner to confirm via a suggested Spotify row', async () => {
    mocks.selectRows.push([profile]);
    const outcome = await requestArtistIdentityConfirmation({
      profileId: 'p1',
      decision: 'needs_confirmation',
    } as never);
    expect(outcome).toBe('requested');
    const [value] = mocks.upsert.mock.calls[0];
    expect(value).toMatchObject({
      providerId: 'spotify',
      status: 'suggested',
      externalArtistId: profile.spotifyId,
      externalArtistUrl: `https://open.spotify.com/artist/${profile.spotifyId}`,
      matchSource: ARTIST_IDENTITY_CHECK_SOURCE,
    });
  });

  it('does nothing for certified profiles or profiles without Spotify', async () => {
    expect(
      await requestArtistIdentityConfirmation({
        decision: 'certified',
      } as never)
    ).toBe('not_needed');
    mocks.selectRows.push([{ ...profile, spotifyId: null }]);
    expect(
      await requestArtistIdentityConfirmation({
        profileId: 'p1',
        decision: 'needs_confirmation',
      } as never)
    ).toBe('no_spotify_identity');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
