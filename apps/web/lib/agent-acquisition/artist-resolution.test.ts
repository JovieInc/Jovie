import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spotifyGet: vi.fn(),
  spotifySearch: vi.fn(),
  appleGet: vi.fn(),
  appleSearch: vi.fn(),
  blacklist: vi.fn(),
}));
vi.mock('@/lib/spotify/client', () => ({
  spotifyClient: {
    getArtist: mocks.spotifyGet,
    searchArtists: mocks.spotifySearch,
  },
}));
vi.mock('@/lib/spotify/blacklist', () => ({
  isBlacklistedSpotifyId: mocks.blacklist,
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  getArtist: mocks.appleGet,
  searchArtist: mocks.appleSearch,
  extractBio: (artist: {
    attributes: { editorialNotes?: { short: string } };
  }) => artist.attributes.editorialNotes?.short ?? null,
  extractImageUrls: (artwork?: { url: string }) =>
    artwork
      ? { large: artwork.url.replace('{w}', '600').replace('{h}', '600') }
      : null,
}));

import { resolveAgentArtist } from './artist-resolution';

const ID = '4Z8W4fKeB5YxbusRsdQVPb';
const SECOND = '0123456789012345678901';
const spotify = (id = ID, name = 'Radiohead') => ({
  spotifyId: id,
  name,
  imageUrl: 'https://i.scdn.co/image/artist',
  bio: 'A public biography',
  genres: ['rock'],
  followerCount: 10,
  popularity: 10,
  externalUrls: {},
  owner_email: 'must-not-return@example.com',
});
const apple = () => ({
  id: '657515',
  type: 'artists',
  attributes: {
    name: 'Radiohead',
    genreNames: ['Alternative'],
    artwork: {
      url: 'https://is1-ssl.mzstatic.com/image/{w}x{h}.jpg',
      width: 1000,
      height: 1000,
    },
    editorialNotes: { short: '<b>Public biography</b>' },
    url: 'https://evil.example/redirect',
  },
});

describe('anonymous agent artist resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.blacklist.mockReturnValue(false);
    mocks.spotifyGet.mockResolvedValue(spotify());
    mocks.appleGet.mockResolvedValue(apple());
    mocks.spotifySearch.mockResolvedValue([]);
    mocks.appleSearch.mockResolvedValue([]);
  });

  it('resolves exact Spotify identity to allowlisted public provider fields only', async () => {
    const result = await resolveAgentArtist({
      input: `https://open.spotify.com/artist/${ID}?si=secret`,
    });
    expect(mocks.spotifyGet).toHaveBeenCalledExactlyOnceWith(ID);
    expect(result).toEqual({
      status: 'resolved',
      next_action: 'workspace.create_draft',
      retryable: false,
      artist: {
        artist_id: `spotify:${ID}`,
        provider: 'spotify',
        external_id: ID,
        display_name: 'Radiohead',
        source_url: `https://open.spotify.com/artist/${ID}`,
        image_url: 'https://i.scdn.co/image/artist',
        bio: 'A public biography',
        genres: ['rock'],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /owner_email|must-not-return|secret/
    );
    expect(mocks.spotifySearch).not.toHaveBeenCalled();
    expect(mocks.appleGet).not.toHaveBeenCalled();
  });

  it('returns ranked same-name candidates and never silently selects even a single match', async () => {
    mocks.spotifySearch.mockResolvedValueOnce([
      spotify(SECOND, 'Tim White'),
      spotify(ID, 'Tim White'),
      spotify(SECOND, 'Duplicate'),
    ]);
    const result = await resolveAgentArtist({ input: 'Tim White' });
    expect(mocks.spotifySearch).toHaveBeenCalledExactlyOnceWith('Tim White', 5);
    expect(result.status).toBe('ambiguous_artist');
    if (result.status !== 'ambiguous_artist')
      throw new Error('Expected candidates');
    expect(result.candidates.map(candidate => candidate.external_id)).toEqual([
      SECOND,
      ID,
    ]);
    mocks.spotifySearch.mockResolvedValueOnce([spotify()]);
    expect(await resolveAgentArtist({ input: 'Radiohead' })).toMatchObject({
      status: 'ambiguous_artist',
      next_action: 'select_artist',
    });
    expect(mocks.spotifyGet).not.toHaveBeenCalled();
  });

  it('uses the existing Apple client and preserves explicit storefront without trusting upstream URLs', async () => {
    const result = await resolveAgentArtist({
      input: 'https://music.apple.com/gb/artist/radiohead/657515',
    });
    expect(mocks.appleGet).toHaveBeenCalledExactlyOnceWith('657515', {
      storefront: 'gb',
    });
    expect(result).toMatchObject({
      status: 'resolved',
      artist: {
        artist_id: 'apple_music:657515',
        source_url: 'https://music.apple.com/gb/artist/657515',
        bio: 'Public biography',
        image_url: 'https://is1-ssl.mzstatic.com/image/600x600.jpg',
      },
    });
    expect(JSON.stringify(result)).not.toContain('evil.example');
    expect(mocks.spotifyGet).not.toHaveBeenCalled();
  });

  it('returns Apple search candidates without importing or asserting ownership', async () => {
    mocks.appleSearch.mockResolvedValue([apple()]);
    expect(
      await resolveAgentArtist({ input: 'Radiohead', provider: 'apple_music' })
    ).toMatchObject({
      status: 'ambiguous_artist',
      candidates: [{ artist_id: 'apple_music:657515' }],
    });
    expect(mocks.appleSearch).toHaveBeenCalledExactlyOnceWith(
      'Radiohead',
      {},
      5
    );
    expect(mocks.appleGet).not.toHaveBeenCalled();
  });

  it('keeps a sparse Apple artist usable without inventing biography or artwork', async () => {
    mocks.appleGet.mockResolvedValueOnce({
      id: '657515',
      type: 'artists',
      attributes: { name: 'Radiohead' },
    });
    expect(
      await resolveAgentArtist({ input: 'apple_music:657515' })
    ).toMatchObject({
      status: 'resolved',
      artist: { image_url: null, bio: null, genres: [] },
    });
  });

  it('does not call upstream for invalid URLs or blacklisted exact identities', async () => {
    expect(
      await resolveAgentArtist({ input: 'https://localhost/private' })
    ).toMatchObject({ code: 'UNSUPPORTED_INPUT', retryable: false });
    expect(
      await resolveAgentArtist({ input: '', publish: true })
    ).toMatchObject({ code: 'INVALID_INPUT' });
    mocks.blacklist.mockReturnValue(true);
    expect(await resolveAgentArtist({ input: ID })).toMatchObject({
      code: 'ARTIST_NOT_FOUND',
      retryable: false,
    });
    expect(mocks.spotifyGet).not.toHaveBeenCalled();
    expect(mocks.appleGet).not.toHaveBeenCalled();
    expect(mocks.spotifySearch).not.toHaveBeenCalled();
  });

  it('separates a missing artist from an upstream outage without leaking provider errors', async () => {
    mocks.appleGet.mockResolvedValueOnce(null);
    expect(
      await resolveAgentArtist({ input: 'apple_music:657515' })
    ).toMatchObject({ code: 'ARTIST_NOT_FOUND', retryable: false });
    for (const error of [
      Object.assign(new Error('sensitive'), { code: 'SPOTIFY_NOT_FOUND' }),
      Object.assign(new Error('sensitive'), { statusCode: 404 }),
    ]) {
      mocks.spotifyGet.mockRejectedValueOnce(error);
      expect(await resolveAgentArtist({ input: ID })).toMatchObject({
        code: 'ARTIST_NOT_FOUND',
        retryable: false,
      });
    }
    mocks.spotifyGet.mockRejectedValueOnce(
      new Error('sensitive credential/provider details')
    );
    expect(await resolveAgentArtist({ input: ID })).toEqual({
      status: 'error',
      code: 'UPSTREAM_FAILURE',
      next_action: 'retry',
      retryable: true,
    });
  });

  it('fails closed on mismatched identities and removes malformed or blocked candidates', async () => {
    mocks.spotifyGet.mockResolvedValueOnce(spotify(SECOND));
    expect(await resolveAgentArtist({ input: ID })).toMatchObject({
      code: 'UPSTREAM_FAILURE',
    });
    mocks.spotifySearch.mockResolvedValue([
      spotify('invalid'),
      spotify(ID, ''),
      spotify(SECOND),
    ]);
    mocks.blacklist.mockImplementation((id: string) => id === SECOND);
    expect(await resolveAgentArtist({ input: 'name' })).toMatchObject({
      code: 'ARTIST_NOT_FOUND',
    });
  });

  it('drops untrusted media and bounds optional preview content', async () => {
    const credentialed = new URL('https://i.scdn.co/image/x');
    credentialed.username = 'test-user';
    credentialed.password = 'fixture-only';
    for (const url of [
      'http://i.scdn.co/image/x',
      'https://private.example/photo',
      credentialed.href,
      'not a url',
      'https://i.scdn.co:8443/x',
    ]) {
      mocks.spotifyGet.mockResolvedValueOnce({ ...spotify(), imageUrl: url });
      expect(await resolveAgentArtist({ input: ID })).toMatchObject({
        artist: { image_url: null },
      });
    }
    mocks.spotifyGet.mockResolvedValueOnce({
      ...spotify(),
      imageUrl: null,
      bio: 'a'.repeat(2500),
      genres: Array(30).fill('rock'),
    });
    const result = await resolveAgentArtist({ input: ID });
    if (result.status !== 'resolved')
      throw new Error('Expected resolved artist');
    expect(result.artist.bio).toHaveLength(2000);
    expect(result.artist.genres).toHaveLength(20);
    mocks.spotifySearch.mockResolvedValueOnce([
      { spotifyId: ID, name: 'Radiohead', imageUrl: null },
    ]);
    expect(await resolveAgentArtist({ input: 'Radiohead' })).toMatchObject({
      candidates: [{ bio: null, genres: [] }],
    });
  });
});
