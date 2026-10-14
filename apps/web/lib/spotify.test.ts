import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyAlbum, SpotifyTrack } from './spotify';

const mocks = vi.hoisted(() => ({ requestJson: vi.fn() }));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/spotify/client', () => ({
  getSpotifyArtist: vi.fn(),
  getSpotifyArtistsBatch: vi.fn(),
  spotifyClient: { requestJson: mocks.requestJson },
}));

import { getSpotifyAlbumTracks, getSpotifyArtistAlbums } from './spotify';

function album(id: string): SpotifyAlbum {
  return {
    id,
    name: `Album ${id}`,
    album_type: 'album',
    release_date: '2026-01-01',
    release_date_precision: 'day',
    total_tracks: 1,
    images: [],
    external_urls: { spotify: `https://open.spotify.com/album/${id}` },
    uri: `spotify:album:${id}`,
    artists: [
      { id: 'artist-1', name: 'Artist', external_urls: { spotify: '' } },
    ],
  };
}

const albumsFrom = (offset: number, count: number) =>
  Array.from({ length: count }, (_, i) => album(`a-${offset + i}`));

function track(id: string): SpotifyTrack {
  return {
    id,
    name: `Track ${id}`,
    track_number: 1,
    disc_number: 1,
    duration_ms: 180_000,
    explicit: false,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    uri: `spotify:track:${id}`,
    preview_url: null,
    artists: [],
  };
}

const tracksFrom = (offset: number, count: number) =>
  Array.from({ length: count }, (_, i) => track(`t-${offset + i}`));

function page<T>(offset: number, total: number, items: T[], limit: number) {
  return {
    items,
    total,
    limit,
    offset,
    next: offset + items.length < total ? 'next-page' : null,
  };
}

const albumPage = (offset: number, total: number, items: SpotifyAlbum[]) =>
  page(offset, total, items, 10);
const trackPage = (offset: number, total: number, items: SpotifyTrack[]) =>
  page(offset, total, items, 50);
const embeddedTrackPage = (item: SpotifyTrack) => trackPage(0, 1, [item]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Spotify catalog pagination', () => {
  it('returns complete artist album evidence only after every page is present', async () => {
    const firstPage = albumsFrom(0, 10);
    mocks.requestJson
      .mockResolvedValueOnce(albumPage(0, 11, firstPage))
      .mockResolvedValueOnce(albumPage(10, 11, [album('a-10')]));

    const result = await getSpotifyArtistAlbums('artist-1');

    expect(result).toMatchObject({ total: 11, complete: true });
    expect(result.albums).toHaveLength(11);
    expect(mocks.requestJson).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('limit=10')
    );
    expect(mocks.requestJson).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('offset=10')
    );
  });

  it('rejects repeated IDs and inconsistent artist pagination', async () => {
    for (const [pages, issue] of [
      [
        [
          albumPage(0, 11, albumsFrom(0, 10)),
          albumPage(10, 11, [album('a-9')]),
        ],
        'repeated album',
      ],
      [
        [{ ...albumPage(0, 11, albumsFrom(0, 10)), next: null }],
        'ended inconsistently',
      ],
    ] as const) {
      pages.forEach(page => mocks.requestJson.mockResolvedValueOnce(page));
      const result = await getSpotifyArtistAlbums('artist-1');
      expect(result.complete).toBe(false);
      expect(result.issue).toContain(issue);
    }
  });

  it('keeps partial album evidence when a later artist page fails', async () => {
    mocks.requestJson
      .mockResolvedValueOnce(albumPage(0, 11, albumsFrom(0, 10)))
      .mockRejectedValueOnce(new Error('Spotify unavailable'));

    const result = await getSpotifyArtistAlbums('artist-1');

    expect(result).toMatchObject({ total: 11, complete: false });
    expect(result.albums).toHaveLength(10);
    expect(result.issue).toContain('Spotify unavailable');
  });

  it('marks the 500 album cap incomplete when Spotify reports more results', async () => {
    mocks.requestJson.mockImplementation(async (path: string) => {
      const offset = Number(
        new URLSearchParams(path.split('?')[1]).get('offset')
      );
      return albumPage(offset, 501, albumsFrom(offset, 10));
    });

    const result = await getSpotifyArtistAlbums('artist-1');

    expect(result.albums).toHaveLength(500);
    expect(result.total).toBe(501);
    expect(result.complete).toBe(false);
    expect(result.issue).toContain('500 album cap');
    expect(mocks.requestJson).toHaveBeenCalledTimes(50);
  });

  it('rejects artist album page sizes above the Spotify endpoint limit', async () => {
    const result = await getSpotifyArtistAlbums('artist-1', { limit: 11 });

    expect(result.complete).toBe(false);
    expect(result.issue).toContain('between 1 and 10');
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it('paginates every album track and returns complete results', async () => {
    mocks.requestJson
      .mockResolvedValueOnce(trackPage(0, 51, tracksFrom(0, 50)))
      .mockResolvedValueOnce(trackPage(50, 51, [track('t-50')]));

    const result = await getSpotifyAlbumTracks('album-1');

    expect(result).toMatchObject({
      albumId: 'album-1',
      total: 51,
      complete: true,
    });
    expect(result.tracks).toHaveLength(51);
    expect(mocks.requestJson).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('offset=50')
    );
  });

  it('rejects repeated IDs and short album track pages', async () => {
    for (const [pages, issue] of [
      [
        [
          trackPage(0, 51, tracksFrom(0, 50)),
          trackPage(50, 51, [track('t-49')]),
        ],
        'repeated track',
      ],
      [[trackPage(0, 51, tracksFrom(0, 49))], '49 of 50 expected items'],
    ] as const) {
      pages.forEach(page => mocks.requestJson.mockResolvedValueOnce(page));
      const result = await getSpotifyAlbumTracks('album-1');
      expect(result.complete).toBe(false);
      expect(result.issue).toContain(issue);
    }
  });

  it('accepts complete embedded pages and rejects embedded relinks', async () => {
    const result = await getSpotifyAlbumTracks(
      'album-1',
      embeddedTrackPage(track('t-1'))
    );

    expect(result).toMatchObject({ total: 1, complete: true });
    expect(result.tracks.map(item => item.id)).toEqual(['t-1']);
    const relinked = await getSpotifyAlbumTracks(
      'album-1',
      embeddedTrackPage({
        ...track('replacement'),
        linked_from: { id: 'original' },
      })
    );

    expect(relinked.complete).toBe(false);
    expect(relinked.issue).toContain('relinked track original');
    expect(relinked.tracks).toEqual([]);
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it('marks a relinked track on a later album page as incomplete', async () => {
    mocks.requestJson
      .mockResolvedValueOnce(trackPage(0, 51, tracksFrom(0, 50)))
      .mockResolvedValueOnce(
        trackPage(50, 51, [
          { ...track('replacement'), linked_from: { id: 'original' } },
        ])
      );

    const result = await getSpotifyAlbumTracks('album-1');

    expect(result.complete).toBe(false);
    expect(result.issue).toContain('relinked track original');
    expect(result.tracks).toHaveLength(50);
    expect(result.tracks.some(item => item.id === 'replacement')).toBe(false);
  });

  it('returns partial tracks with incomplete status when a later page fails', async () => {
    mocks.requestJson
      .mockResolvedValueOnce(trackPage(0, 51, tracksFrom(0, 50)))
      .mockRejectedValueOnce(new Error('Spotify unavailable'));

    const result = await getSpotifyAlbumTracks('album-1');

    expect(result.complete).toBe(false);
    expect(result.total).toBe(51);
    expect(result.tracks).toHaveLength(50);
    expect(result.issue).toContain('Spotify unavailable');
  });

  it('rejects an oversized track inventory before following additional pages', async () => {
    mocks.requestJson.mockResolvedValueOnce(
      trackPage(0, 1001, tracksFrom(0, 50))
    );
    const result = await getSpotifyAlbumTracks('album-1');
    expect(result).toMatchObject({ total: 1001, complete: false, tracks: [] });
    expect(result.issue).toContain('1000 track audit limit');
    expect(mocks.requestJson).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized embedded pages rather than trusting their declared limit', async () => {
    const result = await getSpotifyAlbumTracks(
      'album-1',
      page(0, 51, tracksFrom(0, 51), 51)
    );
    expect(result.complete).toBe(false);
    expect(result.issue).toContain('invalid page limit');
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it('bounds a complete 1000-track album to 20 requests in the supplied market', async () => {
    mocks.requestJson.mockImplementation(async (path: string) => {
      const params = new URLSearchParams(path.split('?')[1]);
      expect(params.get('market')).toBe('GB');
      const offset = Number(params.get('offset'));
      return trackPage(offset, 1000, tracksFrom(offset, 50));
    });
    const result = await getSpotifyAlbumTracks('album-1', undefined, 'GB');
    expect(result.complete).toBe(true);
    expect(result.tracks).toHaveLength(1000);
    expect(mocks.requestJson).toHaveBeenCalledTimes(20);
  });

  it('rejects fetched pages missing the requested offset', async () => {
    const response = trackPage(0, 1, [track('t-1')]);
    mocks.requestJson.mockResolvedValueOnce({ ...response, offset: undefined });
    const result = await getSpotifyAlbumTracks('album-1');
    expect(result.complete).toBe(false);
    expect(result.issue).toContain('offset undefined');
  });
});
