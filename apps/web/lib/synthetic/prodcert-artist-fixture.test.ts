import { describe, expect, it } from 'vitest';
import {
  type ProdcertArtistFixture,
  ProdcertFixtureUnavailableError,
  selectUnclaimedCertArtist,
} from './prodcert-artist-fixture';

const POOL: ProdcertArtistFixture[] = [
  {
    spotifyId: 'aaaaaaaaaaaaaaaaaaaa01',
    name: 'Pool One',
    url: 'https://open.spotify.com/artist/aaaaaaaaaaaaaaaaaaaa01',
  },
  {
    spotifyId: 'aaaaaaaaaaaaaaaaaaaa02',
    name: 'Pool Two',
    url: 'https://open.spotify.com/artist/aaaaaaaaaaaaaaaaaaaa02',
  },
  {
    spotifyId: 'aaaaaaaaaaaaaaaaaaaa03',
    name: 'Pool Three',
    url: 'https://open.spotify.com/artist/aaaaaaaaaaaaaaaaaaaa03',
  },
];

describe('selectUnclaimedCertArtist', () => {
  it('picks the first candidate with no bound creator_profiles row', async () => {
    const probed: string[] = [];
    const chosen = await selectUnclaimedCertArtist(POOL, async spotifyId => {
      probed.push(spotifyId);
      return false;
    });
    expect(chosen).toBe(POOL[0]);
    expect(probed).toEqual([POOL[0].spotifyId]);
  });

  it('skips bound artists in pool order', async () => {
    const probed: string[] = [];
    const chosen = await selectUnclaimedCertArtist(POOL, async spotifyId => {
      probed.push(spotifyId);
      return spotifyId !== POOL[1].spotifyId;
    });
    expect(chosen).toBe(POOL[1]);
    expect(probed).toEqual([POOL[0].spotifyId, POOL[1].spotifyId]);
  });

  it('treats any bound row as taken, matching the server conflict predicate', async () => {
    // The server reports ownership_conflict for an anonymous principal on ANY
    // creator_profiles row (claimed or not), so a fully-bound pool must throw
    // rather than return a fixture the server would then refuse.
    await expect(
      selectUnclaimedCertArtist(POOL, async () => true)
    ).rejects.toBeInstanceOf(ProdcertFixtureUnavailableError);
  });

  it('throws ProdcertFixtureUnavailableError naming every probed id when all are bound', async () => {
    const caughtError = await selectUnclaimedCertArtist(
      POOL,
      async () => true
    ).then(
      () => null,
      caught =>
        caught instanceof ProdcertFixtureUnavailableError ? caught : undefined
    );
    expect(caughtError).toBeInstanceOf(ProdcertFixtureUnavailableError);
    expect(caughtError?.takenSpotifyIds).toEqual(
      POOL.map(candidate => candidate.spotifyId)
    );
    expect(caughtError?.message).toContain(POOL[2].spotifyId);
  });

  it('propagates probe failures instead of silently choosing a fixture', async () => {
    await expect(
      selectUnclaimedCertArtist(POOL, async () => {
        throw new Error('probe unavailable');
      })
    ).rejects.toThrow('probe unavailable');
  });
});
