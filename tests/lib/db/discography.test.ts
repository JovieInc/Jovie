import { describe, expect, it } from 'vitest';
import { buildReleaseRows, buildTrackRows } from '@/lib/db/discography';
import type { SpotifyReleasePayload } from '@/lib/spotify/discography';

const releasePayload: SpotifyReleasePayload = {
  spotifyId: 'album-1',
  spotifyUrl: 'https://open.spotify.com/album/album-1',
  name: 'Test Album',
  albumType: 'single',
  releaseDate: '2024-01-01',
  releaseDatePrecision: 'day',
  totalTracks: null,
  upc: 'upc-123',
  imageUrl: 'https://image',
  artists: [{ id: 'artist-1', name: 'Artist One' }],
  tracks: [
    {
      spotifyId: 'track-1',
      spotifyUrl: 'https://open.spotify.com/track/track-1',
      name: 'Track One',
      durationMs: 120000,
      trackNumber: 1,
      discNumber: 1,
      explicit: false,
      isrc: 'isrc-1',
      previewUrl: null,
      artists: [{ name: 'Artist One' }],
    },
    {
      spotifyId: 'track-2',
      spotifyUrl: 'https://open.spotify.com/track/track-2',
      name: 'Track Two',
      durationMs: 150000,
      trackNumber: 2,
      discNumber: 1,
      explicit: true,
      isrc: null,
      previewUrl: 'https://preview',
      artists: [],
    },
  ],
};

describe('discography upsert helpers', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  it('builds release rows with normalized totals and timestamps', () => {
    const rows = buildReleaseRows({
      creatorProfileId: 'creator-1',
      releases: [releasePayload],
      now,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      creatorProfileId: 'creator-1',
      spotifyId: 'album-1',
      albumType: 'single',
      totalTracks: releasePayload.tracks.length,
      upc: 'upc-123',
    });
    expect(rows[0].lastSeenAt).toEqual(now);
    expect(rows[0].updatedAt).toEqual(now);
  });

  it('builds track rows keyed by release mapping', () => {
    const releaseMap = new Map<string, string>([['album-1', 'release-1']]);
    const rows = buildTrackRows({
      creatorProfileId: 'creator-1',
      releases: [releasePayload],
      releaseIdBySpotifyId: releaseMap,
      now,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      releaseId: 'release-1',
      spotifyId: 'track-1',
      explicit: false,
      isrc: 'isrc-1',
    });
    expect(rows[1].explicit).toBe(true);
    expect(rows[1].releaseId).toBe('release-1');
  });
});
