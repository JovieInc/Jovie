import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mocks.available,
  spotifyClient: { requestJson: mocks.request },
}));

import {
  deezerAlbumsByUpc,
  deezerSearchAlbums,
  spotifyAlbumsByUpc,
  spotifySearchAlbums,
  upcVariants,
} from './catalog-upc-sources';

const ID = 'A'.repeat(22);
const ID2 = 'B'.repeat(22);

function spotifyAlbum(id: string, upc: string | null, artists = ['Tim White']) {
  return {
    id,
    type: 'album',
    name: 'Release',
    artists: artists.map(name => ({ name })),
    external_ids: upc ? { upc } : {},
  };
}

describe('Spotify UPC and name adapters', () => {
  beforeEach(() => {
    mocks.available.mockReturnValue(true);
    mocks.request.mockReset();
  });

  it('builds the UPC spellings providers store', () => {
    expect(upcVariants('00602567247746')).toEqual([
      '0602567247746',
      '602567247746',
      '00602567247746',
    ]);
    expect(upcVariants('abc')).toEqual([]);
  });

  it('links a UPC only after the album record reports the same UPC', async () => {
    mocks.request.mockImplementation(async (endpoint: string) =>
      endpoint.startsWith('/search')
        ? { albums: { items: [{ id: ID }] } }
        : { albums: [spotifyAlbum(ID, '0602567247746')] }
    );
    const albums = await spotifyAlbumsByUpc('602567247746');
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      provider: 'spotify',
      url: `https://open.spotify.com/album/${ID}`,
      provenance: 'upc_exact',
    });
    expect(mocks.request.mock.calls[0]?.[0]).toContain(
      encodeURIComponent('upc:0602567247746')
    );
  });

  it('drops a search hit whose record carries a different UPC', async () => {
    mocks.request.mockImplementation(async (endpoint: string) =>
      endpoint.startsWith('/search')
        ? { albums: { items: [{ id: ID }] } }
        : { albums: [spotifyAlbum(ID, '999999999999')] }
    );
    expect(await spotifyAlbumsByUpc('602567247746')).toEqual([]);
  });

  it('abstains when two Spotify albums share the UPC', async () => {
    mocks.request.mockImplementation(async (endpoint: string) =>
      endpoint.startsWith('/search')
        ? { albums: { items: [{ id: ID }, { id: ID2 }] } }
        : {
            albums: [
              spotifyAlbum(ID, '602567247746'),
              spotifyAlbum(ID2, '602567247746'),
            ],
          }
    );
    expect(await spotifyAlbumsByUpc('602567247746')).toEqual([]);
  });

  it('returns nothing without credentials or on provider errors', async () => {
    mocks.available.mockReturnValue(false);
    expect(await spotifyAlbumsByUpc('602567247746')).toEqual([]);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.available.mockReturnValue(true);
    mocks.request.mockRejectedValue(new Error('429'));
    expect(await spotifyAlbumsByUpc('602567247746')).toEqual([]);
  });

  it('searches by name, keeps multi-artist credits and reads the UPC', async () => {
    mocks.request.mockImplementation(async (endpoint: string) =>
      endpoint.startsWith('/search')
        ? {
            albums: {
              items: [
                {
                  id: ID,
                  name: 'Release',
                  artists: [{ name: 'Coldplay' }, { name: 'BTS' }],
                },
                {
                  id: ID2,
                  name: 'Release (Deluxe)',
                  artists: [{ name: 'BTS' }],
                },
              ],
            },
          }
        : {
            albums: [spotifyAlbum(ID, '602567247746', ['Coldplay', 'BTS'])],
          }
    );
    const albums = await spotifySearchAlbums('BTS', 'Release');
    const same = albums.find(album => album.url.endsWith(ID));
    expect(same).toMatchObject({
      artists: ['Coldplay', 'BTS'],
      upc: '602567247746',
      provenance: 'exact_name',
    });
    const sibling = albums.find(album => album.url.endsWith(ID2));
    expect(sibling?.upc).toBeNull();
  });

  it('drops same-title hits whose UPC cannot be read', async () => {
    mocks.request.mockImplementation(async (endpoint: string) =>
      endpoint.startsWith('/search')
        ? {
            albums: {
              items: [
                { id: ID, name: 'Release', artists: [{ name: 'Tim White' }] },
              ],
            },
          }
        : { albums: [spotifyAlbum(ID, null)] }
    );
    expect(await spotifySearchAlbums('Tim White', 'Release')).toEqual([]);
  });
});

describe('Deezer UPC and name adapters', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const deezerAlbum = (upc: string, extra: object = {}) => ({
    id: 12345,
    type: 'album',
    title: 'Release',
    upc,
    artist: { name: 'Tim White' },
    contributors: [{ name: 'Tim White' }, { name: 'Guest' }],
    ...extra,
  });

  it('tries UPC spellings and verifies the reported UPC', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('upc:0602567247746')
        ? Response.json({ error: { type: 'DataException', code: 800 } })
        : Response.json(deezerAlbum('602567247746'))
    );
    const albums = await deezerAlbumsByUpc('00602567247746');
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      provider: 'deezer',
      url: 'https://www.deezer.com/album/12345',
      artists: ['Tim White', 'Guest'],
    });
  });

  it('rejects an album that reports a different UPC', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(deezerAlbum('111111111111'))
    );
    expect(await deezerAlbumsByUpc('602567247746')).toEqual([]);
  });

  it('searches by name and reads each match for its UPC', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/search/album')
        ? Response.json({
            data: [
              {
                id: 12345,
                title: 'Release',
                artist: { name: 'Tim White' },
              },
              { id: 999, title: 'Other', artist: { name: 'Tim White' } },
            ],
          })
        : Response.json(deezerAlbum('602567247746'))
    );
    const albums = await deezerSearchAlbums('Tim White', 'Release');
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      upc: '602567247746',
      provenance: 'exact_name',
    });
  });

  it('abstains on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await deezerAlbumsByUpc('602567247746')).toEqual([]);
    expect(await deezerSearchAlbums('A', 'B')).toEqual([]);
  });
});
