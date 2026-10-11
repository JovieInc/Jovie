// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  byUrl: vi.fn(),
  available: vi.fn(),
  spotify: vi.fn(),
}));
vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  lookupMusicBrainzArtistsByUrl: mocks.byUrl,
  getMusicBrainzArtist: vi.fn(),
}));
vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mocks.available,
  spotifyClient: { requestJson: mocks.spotify },
}));

import { resolveInHouse } from './in-house';
import { createDefaultInHouseSources } from './in-house-sources';

const APPLE = 'https://music.apple.com/gb/artist/name/42?uo=4';
const SPOTIFY_ID = '4Z8W4fKeB5YxbusRsdQVPb';
const SPOTIFY = `https://open.spotify.com/intl-de/artist/${SPOTIFY_ID}?si=tracking`;
const DEEZER = 'https://www.deezer.com/fr/artist/33';
const appleRow = { wrapperType: 'artist', artistId: 42, artistName: '東京' };
const spotifyRow = { type: 'artist', id: SPOTIFY_ID, name: 'Мир' };
const deezerRow = { type: 'artist', id: 33, name: 'محمد' };
const fetchMock = vi.fn<typeof fetch>();

async function resolve(url: string, signal?: AbortSignal) {
  return resolveInHouse(
    { kind: 'artist', url },
    createDefaultInHouseSources(signal)
  );
}

describe('artist URL verification without a MusicBrainz URL match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.byUrl.mockResolvedValue([]);
    mocks.available.mockReturnValue(true);
    mocks.spotify.mockResolvedValue(spotifyRow);
    fetchMock.mockResolvedValue(Response.json({ resultCount: 0, results: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('verifies Apple artist identity and preserves the input storefront', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ resultCount: 1, results: [appleRow] })
    );
    const result = await resolve(APPLE);
    expect(result).toMatchObject({
      status: 'resolved',
      artist: '東京',
      mbid: null,
      links: [
        {
          provider: 'apple_music',
          url: 'https://music.apple.com/gb/artist/42',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://itunes.apple.com/lookup?id=42&entity=musicArtist&country=gb',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('verifies a Spotify artist using the existing managed client', async () => {
    expect(await resolve(SPOTIFY)).toMatchObject({
      status: 'resolved',
      artist: 'Мир',
      links: [
        {
          provider: 'spotify',
          url: `https://open.spotify.com/artist/${SPOTIFY_ID}`,
        },
      ],
    });
    expect(mocks.spotify).toHaveBeenCalledWith(
      `/artists/${SPOTIFY_ID}`,
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not strip an id prefix from a Spotify identifier', async () => {
    const id = 'id8W4fKeB5YxbusRsdQVPb';
    mocks.spotify.mockResolvedValue({ ...spotifyRow, id });
    expect(
      await resolve(`https://open.spotify.com/artist/${id}`)
    ).toMatchObject({ status: 'resolved', artist: 'Мир' });
    expect(mocks.spotify).toHaveBeenCalledWith(
      `/artists/${id}`,
      expect.any(Object)
    );
  });
  it('supports an Apple id prefix and trailing slash', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [appleRow] }));
    expect(
      await resolve('https://music.apple.com/us/artist/id42/')
    ).toMatchObject({ status: 'resolved', artist: '東京' });
  });
  it('does not accept malformed Spotify or Deezer payloads', async () => {
    mocks.spotify.mockResolvedValue(null);
    expect(await resolve(SPOTIFY)).toMatchObject({ status: 'upstream_error' });
    fetchMock.mockResolvedValue(Response.json(null));
    expect(await resolve(DEEZER)).toMatchObject({ status: 'upstream_error' });
  });
  it('verifies a Deezer artist by the returned numeric ID and entity type', async () => {
    fetchMock.mockResolvedValue(Response.json(deezerRow));
    expect(await resolve(DEEZER)).toMatchObject({
      status: 'resolved',
      artist: 'محمد',
      links: [{ provider: 'deezer', url: 'https://www.deezer.com/artist/33' }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deezer.com/artist/33',
      expect.any(Object)
    );
  });

  it.each([
    { ...appleRow, artistId: 43 },
    { ...appleRow, wrapperType: 'track' },
    { ...appleRow, artistName: '' },
    { ...appleRow, artistId: '42' },
  ])('does not resolve inconsistent Apple records %#', async row => {
    fetchMock.mockResolvedValue(
      Response.json({ resultCount: 1, results: [row] })
    );
    expect(await resolve(APPLE)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });
  it.each([
    { ...spotifyRow, id: 'different' },
    { ...spotifyRow, type: 'track' },
    { ...spotifyRow, name: ' ' },
  ])('does not resolve inconsistent Spotify records %#', async row => {
    mocks.spotify.mockResolvedValue(row);
    expect(await resolve(SPOTIFY)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });
  it.each([
    { ...deezerRow, id: 34 },
    { ...deezerRow, type: 'track' },
    { ...deezerRow, name: null },
    { ...deezerRow, id: '33' },
  ])('does not resolve inconsistent Deezer records %#', async row => {
    fetchMock.mockResolvedValue(Response.json(row));
    expect(await resolve(DEEZER)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });

  it('does not resolve an Apple artist from an empty catalog response', async () => {
    expect(await resolve(APPLE)).toMatchObject({
      status: 'no_match',
      links: [],
      artist: null,
      confidence: 0,
    });
  });
  it('does not resolve an HTTP 404', async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 404 }));
    expect(await resolve(APPLE)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });
  it('does not resolve a Deezer no-data error', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { type: 'DataException', code: 800 } })
    );
    expect(await resolve(DEEZER)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });
  it('does not turn a Deezer service error into absence', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { type: 'Exception', code: 4 } })
    );
    expect(await resolve(DEEZER)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
  });
  it('does not resolve a Spotify 404', async () => {
    mocks.spotify.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
    expect(await resolve(SPOTIFY)).toMatchObject({
      status: 'no_match',
      links: [],
      confidence: 0,
    });
  });
  it('reports unavailable Spotify credentials as an upstream failure', async () => {
    mocks.available.mockReturnValue(false);
    expect(await resolve(SPOTIFY)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
    expect(mocks.spotify).not.toHaveBeenCalled();
  });
  it('reports Spotify rate limits as upstream failures', async () => {
    mocks.spotify.mockRejectedValue(
      Object.assign(new Error('limited'), { status: 429 })
    );
    expect(await resolve(SPOTIFY)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
  });
  it.each([401, 403, 429, 500, 302])(
    'retains HTTP %s as an upstream failure',
    async status => {
      fetchMock.mockResolvedValue(new Response(null, { status }));
      expect(await resolve(APPLE)).toMatchObject({
        status: 'upstream_error',
        links: [],
        confidence: 0,
      });
    }
  );
  it.each([null, {}, { results: 'invalid' }])(
    'retains malformed Apple payload %# as an upstream failure',
    async payload => {
      fetchMock.mockResolvedValue(Response.json(payload));
      expect(await resolve(APPLE)).toMatchObject({
        status: 'upstream_error',
        links: [],
        confidence: 0,
      });
    }
  );
  it('retains malformed JSON and transport errors as upstream failures', async () => {
    fetchMock.mockResolvedValue(new Response('invalid JSON'));
    expect(await resolve(APPLE)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
    fetchMock.mockRejectedValue(new TypeError('network error'));
    expect(await resolve(APPLE)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
  });
  it('checks a pre-aborted caller before reading the provider', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await resolve(APPLE, controller.signal)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a caller signal active while parsing the body', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      async (_url, options) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_yes, no) => {
              options?.signal?.addEventListener(
                'abort',
                () => no(new Error('aborted')),
                { once: true }
              );
              controller.abort();
            }),
        }) as Response
    );
    expect(await resolve(APPLE, controller.signal)).toMatchObject({
      status: 'upstream_error',
      links: [],
      confidence: 0,
    });
  });
});
