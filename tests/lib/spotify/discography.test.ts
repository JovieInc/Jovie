import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSpotifyDiscography } from '@/lib/spotify/discography';

const spotifyFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/spotify', () => {
  class MockRateLimitError extends Error {}

  return {
    spotifyFetch: spotifyFetchMock,
    getSpotifyTokenOrThrow: vi.fn().mockResolvedValue('token'),
    buildSpotifyAlbumUrl: (id: string) => `album-url/${id}`,
    buildSpotifyTrackUrl: (id: string) => `track-url/${id}`,
    SpotifyRateLimitError: MockRateLimitError,
  };
});

describe('fetchSpotifyDiscography', () => {
  afterEach(() => {
    spotifyFetchMock.mockReset();
  });

  it('returns release and track metadata including UPC and ISRC', async () => {
    const albumList = {
      items: [
        {
          id: 'album-1',
          name: 'Album One',
          album_type: 'album',
          release_date: '2024-01-01',
          release_date_precision: 'day',
          total_tracks: 1,
          external_urls: { spotify: 'https://album' },
          images: [{ url: 'https://image' }],
        },
      ],
      next: null,
    };

    const albumDetails = {
      id: 'album-1',
      name: 'Album One',
      album_type: 'album',
      release_date: '2024-01-01',
      release_date_precision: 'day',
      total_tracks: 1,
      album_group: 'album',
      external_urls: { spotify: 'https://album' },
      external_ids: { upc: 'upc-123' },
      images: [{ url: 'https://image' }],
      artists: [{ id: 'artist-1', name: 'Artist One' }],
      tracks: {
        items: [
          {
            id: 'track-1',
            name: 'Song One',
            track_number: 1,
            disc_number: 1,
            duration_ms: 123000,
            explicit: true,
            external_urls: { spotify: 'https://track' },
            artists: [{ id: 'artist-1', name: 'Artist One' }],
          },
        ],
        next: null,
      },
    };

    const trackDetails = {
      tracks: [
        {
          id: 'track-1',
          name: 'Song One',
          duration_ms: 123000,
          external_ids: { isrc: 'isrc-123' },
          explicit: true,
          preview_url: 'https://preview',
          external_urls: { spotify: 'https://track' },
          artists: [{ id: 'artist-1', name: 'Artist One' }],
        },
      ],
    };

    spotifyFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/artists/')) return albumList;
      if (url.includes('/tracks?ids=')) return trackDetails;
      if (url.includes('/albums/') && url.includes('market=US'))
        return albumDetails;
      throw new Error(`Unexpected Spotify URL ${url}`);
    });

    const releases = await fetchSpotifyDiscography('artist-1');

    expect(spotifyFetchMock).toHaveBeenCalled();
    expect(releases).toHaveLength(1);

    const release = releases[0];
    expect(release.upc).toBe('upc-123');
    expect(release.imageUrl).toBe('https://image');
    expect(release.tracks).toHaveLength(1);
    expect(release.tracks[0]).toMatchObject({
      isrc: 'isrc-123',
      spotifyUrl: 'https://track',
      explicit: true,
    });
  });
});
