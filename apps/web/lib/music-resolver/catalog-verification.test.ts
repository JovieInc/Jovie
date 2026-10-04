// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ available: vi.fn(), spotify: vi.fn() }));
vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mocks.available,
  spotifyClient: { requestJson: mocks.spotify },
}));
vi.mock('@/lib/discography/provider-links', () => ({
  lookupAppleMusicByIsrc: vi.fn(async () => null),
  lookupDeezerByIsrc: vi.fn(async () => null),
  lookupSpotifyByIsrc: vi.fn(async () => null),
}));
vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  lookupMusicBrainzRecordingUrlRels: vi.fn(async () => []),
}));

import { resolveInHouse } from './in-house';
import { createDefaultInHouseSources } from './in-house-sources';

const ID = '4Z8W4fKeB5YxbusRsdQVPb';
const fetchMock = vi.fn<typeof fetch>();
const appleTrack = {
  wrapperType: 'track',
  kind: 'song',
  trackId: 456,
  collectionId: 123,
  trackName: '東京',
  artistName: 'Мир',
  trackViewUrl: 'https://music.apple.com/gb/album/name/123?i=456',
};
const appleAlbum = {
  wrapperType: 'collection',
  collectionType: 'Album',
  collectionId: 123,
  collectionName: '東京',
  artistName: 'Мир',
  collectionViewUrl: 'https://music.apple.com/gb/album/name/123',
};

async function resolve(
  kind: 'track' | 'album',
  url: string,
  signal?: AbortSignal
) {
  return resolveInHouse(
    kind === 'track' ? { kind: 'track', url } : { kind: 'album', url },
    createDefaultInHouseSources(signal)
  );
}

describe('verified track and album URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available.mockReturnValue(true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['track', 'album'] as const)(
    'hydrates Spotify %s metadata and uses the returned identity',
    async kind => {
      mocks.spotify.mockResolvedValue({
        id: ID,
        type: kind,
        name: '東京',
        artists: [{ name: 'Мир' }],
        external_ids:
          kind === 'track' ? { isrc: 'usabc1234567' } : { upc: '123456789012' },
      });
      const source = createDefaultInHouseSources();
      const result =
        kind === 'track'
          ? await source.trackByUrl(
              `https://open.spotify.com/intl-de/track/${ID}?si=x`,
              'GB'
            )
          : await source.albumByUrl(
              `https://open.spotify.com/album/${ID}`,
              'GB'
            );
      expect(result).toMatchObject({
        title: '東京',
        artist: 'Мир',
        url: `https://open.spotify.com/${kind}/${ID}`,
      });
      expect(result).toHaveProperty(
        kind === 'track' ? 'isrc' : 'upc',
        kind === 'track' ? 'USABC1234567' : '123456789012'
      );
      expect(mocks.spotify).toHaveBeenCalledWith(
        `/${kind}s/${ID}?market=GB`,
        expect.objectContaining({
          redirect: 'error',
          signal: expect.any(AbortSignal),
        })
      );
    }
  );

  it('accepts a Spotify track relink only with its original track identity', async () => {
    const linkedId = '6habFhsOp2NvshLv26DqMb';
    mocks.spotify.mockResolvedValue({
      id: linkedId,
      type: 'track',
      name: 'Song',
      artists: [{ name: 'Artist' }],
      linked_from: { id: ID, type: 'track' },
    });
    expect(
      await resolve('track', `https://open.spotify.com/track/${ID}`)
    ).toMatchObject({
      status: 'resolved',
      links: [{ url: `https://open.spotify.com/track/${linkedId}` }],
    });
  });

  it.each(['track', 'album'] as const)(
    'does not invent a Spotify %s when credentials are missing',
    async kind => {
      mocks.available.mockReturnValue(false);
      expect(
        await resolve(kind, `https://open.spotify.com/${kind}/${ID}`)
      ).toMatchObject({ status: 'upstream_error', links: [], confidence: 0 });
      expect(mocks.spotify).not.toHaveBeenCalled();
    }
  );
  it.each(['track', 'album'] as const)(
    'distinguishes Spotify %s absence from outages',
    async kind => {
      const url = `https://open.spotify.com/${kind}/${ID}`;
      for (const status of [401, 403, 429, 500]) {
        mocks.spotify.mockRejectedValue(
          Object.assign(new Error('provider failure'), { status })
        );
        expect(await resolve(kind, url)).toMatchObject({
          status: 'upstream_error',
          links: [],
        });
      }
      mocks.spotify.mockRejectedValue(
        Object.assign(new Error('missing'), { status: 404 })
      );
      expect(await resolve(kind, url)).toMatchObject({
        status: 'no_match',
        links: [],
      });
    }
  );
  it.each(['track', 'album'] as const)(
    'rejects inconsistent Spotify %s records',
    async kind => {
      const good = {
        id: ID,
        type: kind,
        name: 'Song',
        artists: [{ name: 'Artist' }],
      };
      for (const row of [
        { ...good, id: 'different' },
        { ...good, type: 'artist' },
        { ...good, name: '' },
        { ...good, artists: [] },
        { ...good, id: 'different', linked_from: { id: ID, type: 'artist' } },
      ]) {
        mocks.spotify.mockResolvedValue(row);
        expect(
          await resolve(kind, `https://open.spotify.com/${kind}/${ID}`)
        ).toMatchObject({ status: 'no_match', links: [] });
      }
      mocks.spotify.mockResolvedValue(null);
      expect(
        await resolve(kind, `https://open.spotify.com/${kind}/${ID}`)
      ).toMatchObject({ status: 'upstream_error' });
    }
  );

  it.each(['track', 'album'] as const)(
    'selects the exact Apple %s row, preserving storefront',
    async kind => {
      const row = kind === 'track' ? appleTrack : appleAlbum;
      fetchMock.mockResolvedValue(
        Response.json({
          results: [{ ...row, trackId: 999, collectionId: 999 }, row],
        })
      );
      const result = await resolve(
        kind,
        kind === 'track'
          ? 'https://music.apple.com/gb/album/name/123?i=456'
          : 'https://music.apple.com/gb/album/name/id123/'
      );
      expect(result).toMatchObject({
        status: 'resolved',
        title: '東京',
        artist: 'Мир',
        links: [
          {
            url:
              kind === 'track'
                ? 'https://music.apple.com/gb/album/123?i=456'
                : 'https://music.apple.com/gb/album/123',
          },
        ],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          `entity=${kind === 'track' ? 'song' : 'album'}&country=gb`
        ),
        expect.objectContaining({ redirect: 'error' })
      );
    }
  );
  it.each(['track', 'album'] as const)(
    'rejects an Apple %s ID or entity mismatch',
    async kind => {
      const good = kind === 'track' ? appleTrack : appleAlbum;
      const idField = kind === 'track' ? 'trackId' : 'collectionId';
      for (const row of [
        { ...good, [idField]: 999 },
        { ...good, [idField]: '123' },
        { ...good, wrapperType: 'artist' },
        { ...good, kind: 'music-video', collectionType: 'TV Season' },
        { ...good, artistName: '' },
      ]) {
        fetchMock.mockResolvedValue(Response.json({ results: [row] }));
        expect(
          await resolve(
            kind,
            kind === 'track'
              ? 'https://music.apple.com/gb/album/123?i=456'
              : 'https://music.apple.com/gb/album/123'
          )
        ).toMatchObject({ status: 'no_match', links: [] });
      }
    }
  );
  it.each(['track', 'album'] as const)(
    'hydrates a verified Deezer %s without trusting its returned link',
    async kind => {
      fetchMock.mockResolvedValue(
        Response.json({
          id: 789,
          type: kind,
          title: 'Song',
          artist: { name: 'Artist' },
          link: 'https://evil.example/item',
          isrc: 'USABC1234567',
          upc: '123456789012',
        })
      );
      expect(
        await resolve(kind, `https://www.deezer.com/fr/${kind}/789`)
      ).toMatchObject({
        status: 'resolved',
        title: 'Song',
        artist: 'Artist',
        links: [{ url: `https://www.deezer.com/${kind}/789` }],
      });
    }
  );
  it.each(['track', 'album'] as const)(
    'rejects Deezer %s ID and type mismatches',
    async kind => {
      const good = {
        id: 789,
        type: kind,
        title: 'Song',
        artist: { name: 'Artist' },
        link: `https://www.deezer.com/${kind}/789`,
      };
      for (const row of [
        { ...good, id: 790 },
        { ...good, id: '789' },
        { ...good, type: 'artist' },
        { ...good, artist: null },
      ]) {
        fetchMock.mockResolvedValue(Response.json(row));
        expect(
          await resolve(kind, `https://www.deezer.com/${kind}/789`)
        ).toMatchObject({ status: 'no_match', links: [] });
      }
    }
  );
  it.each(['track', 'album'] as const)(
    'distinguishes Deezer %s absence from quota failures',
    async kind => {
      const url = `https://www.deezer.com/${kind}/789`;
      fetchMock.mockResolvedValue(
        Response.json({ error: { type: 'DataException', code: 800 } })
      );
      expect(await resolve(kind, url)).toMatchObject({
        status: 'no_match',
        links: [],
      });
      fetchMock.mockResolvedValue(
        Response.json({ error: { type: 'QuotaException', code: 4 } })
      );
      expect(await resolve(kind, url)).toMatchObject({
        status: 'upstream_error',
        links: [],
      });
    }
  );
  it.each(['track', 'album'] as const)(
    'preserves HTTP, JSON and cancellation failures for %s',
    async kind => {
      const url = `https://www.deezer.com/${kind}/789`;
      for (const status of [401, 403, 429, 503]) {
        fetchMock.mockResolvedValue(new Response('', { status }));
        expect(await resolve(kind, url)).toMatchObject({
          status: 'upstream_error',
          links: [],
        });
      }
      fetchMock.mockResolvedValue(new Response('{invalid'));
      expect(await resolve(kind, url)).toMatchObject({
        status: 'upstream_error',
      });
      fetchMock.mockResolvedValue(new Response('', { status: 404 }));
      expect(await resolve(kind, url)).toMatchObject({ status: 'no_match' });
      const controller = new AbortController();
      controller.abort();
      fetchMock.mockClear();
      expect(await resolve(kind, url, controller.signal)).toMatchObject({
        status: 'upstream_error',
        links: [],
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
  it('honors cancellation after response JSON is received', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        controller.abort();
        return { ...appleTrack };
      },
    } as Response);
    expect(
      await resolve(
        'track',
        'https://music.apple.com/gb/album/123?i=456',
        controller.signal
      )
    ).toMatchObject({ status: 'upstream_error', links: [] });
  });
});
