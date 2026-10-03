import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  type InHouseSources,
  PROVENANCE_CONFIDENCE,
  resolveInHouse,
} from './in-house';

function sources(overrides: Partial<InHouseSources> = {}): InHouseSources {
  return {
    trackByIsrc: async () => [],
    trackByUrl: async () => null,
    searchTracks: async () => [],
    albumByUpc: async () => null,
    albumByUrl: async () => null,
    searchAlbums: async () => [],
    artistCandidates: async () => [],
    artistByUrl: async () => null,
    artistByMbid: async () => null,
    urlRelsForIsrc: async () => [],
    ...overrides,
  };
}

const apple = {
  provider: 'apple_music',
  title: 'Signal Fire',
  artist: 'The Artist',
  url: 'https://music.apple.com/us/song/signal-fire/1234',
  isrc: 'USRC17607839',
  upc: null,
  provenance: 'apple_music_isrc',
  confidence: PROVENANCE_CONFIDENCE.isrc_exact,
};

describe('in-house cross-DSP resolver', () => {
  it('loads the default source adapter when no source is injected', async () => {
    const result = await resolveInHouse({
      kind: 'artist',
      url: 'https://music.apple.com/us/artist/the-artist/42',
    });

    expect(result).toMatchObject({
      status: 'resolved',
      kind: 'artist',
      links: [
        expect.objectContaining({
          provider: 'apple_music',
          provenance: 'input_url',
        }),
      ],
    });
  });

  it('resolves a track ISRC across Spotify, Apple Music, Deezer, and MusicBrainz', async () => {
    const result = await resolveInHouse(
      { kind: 'track', isrc: 'USRC17607839' },
      sources({
        trackByIsrc: async () => [
          apple,
          {
            ...apple,
            provider: 'deezer',
            url: 'https://www.deezer.com/track/99',
            provenance: 'deezer_isrc',
          },
          {
            ...apple,
            provider: 'spotify',
            url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
            provenance: 'spotify_isrc',
          },
        ],
        urlRelsForIsrc: async () => [
          {
            provider: 'youtube',
            url: 'https://www.youtube.com/watch?v=LtDL1HHq954',
            provenance: 'musicbrainz_url_rel',
            confidence: PROVENANCE_CONFIDENCE.musicbrainz_url_rel,
          },
        ],
      })
    );

    expect(result.status).toBe('resolved');
    expect(result.kind).toBe('track');
    expect(result.isrc).toBe('USRC17607839');
    expect(result.confidence).toBe(PROVENANCE_CONFIDENCE.isrc_exact);
    expect(result.provenance).toEqual({
      apple_music: 'apple_music_isrc',
      deezer: 'deezer_isrc',
      spotify: 'spotify_isrc',
      youtube: 'musicbrainz_url_rel',
    });
    expect(result.links.map(link => link.provider)).toEqual([
      'apple_music',
      'deezer',
      'spotify',
      'youtube',
    ]);
  });

  it('keeps a remix as a choice instead of a saved track', async () => {
    const result = await resolveInHouse(
      { kind: 'track', artist: 'Tim White', title: 'Take Me Over' },
      sources({
        searchTracks: async () => [
          {
            ...apple,
            title: 'Take Me Over (Austin Leeds Remix)',
            artist: 'Tim White',
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ],
      })
    );

    expect(result.status).toBe('ambiguous');
    expect(result.links).toEqual([]);
    expect(result.candidates).toEqual([
      {
        title: 'Take Me Over (Austin Leeds Remix)',
        artist: 'Tim White',
        url: apple.url,
      },
    ]);
  });

  it('resolves an album from a UPC match', async () => {
    const result = await resolveInHouse(
      { kind: 'album', upc: '196589508261' },
      sources({
        albumByUpc: async () => ({
          provider: 'apple_music',
          title: 'Signal Fire',
          artist: 'The Artist',
          url: 'https://music.apple.com/us/album/signal-fire/1234',
          upc: '196589508261',
          provenance: 'upc_exact',
          confidence: PROVENANCE_CONFIDENCE.upc_exact,
        }),
      })
    );

    expect(result).toMatchObject({
      status: 'resolved',
      kind: 'album',
      upc: '196589508261',
      confidence: PROVENANCE_CONFIDENCE.upc_exact,
      provenance: { apple_music: 'upc_exact' },
    });
  });

  it('resolves an artist from one MusicBrainz url-rel ladder and keeps two MBIDs ambiguous', async () => {
    const resolved = await resolveInHouse(
      { kind: 'artist', name: 'The Artist' },
      sources({
        artistCandidates: async () => [
          {
            name: 'The Artist',
            url: 'https://music.apple.com/us/artist/the-artist/42',
            mbid: '6c3e5c0a-2b2a-4c1a-9c1a-0b0b0b0b0b0b',
            links: [
              {
                provider: 'apple_music',
                url: 'https://music.apple.com/us/artist/the-artist/42',
                provenance: 'musicbrainz_url_rel',
                confidence: PROVENANCE_CONFIDENCE.musicbrainz_url_rel,
              },
              {
                provider: 'spotify',
                url: 'https://open.spotify.com/artist/4bc0TJNIiGEJjFYDwHuOjX',
                provenance: 'exact_name',
                confidence: PROVENANCE_CONFIDENCE.exact_name,
              },
            ],
          },
        ],
      })
    );
    expect(resolved.status).toBe('resolved');
    expect(resolved.confidence).toBe(PROVENANCE_CONFIDENCE.musicbrainz_url_rel);
    expect(resolved.provenance.spotify).toBe('exact_name');
    expect(resolved.mbid).toBe('6c3e5c0a-2b2a-4c1a-9c1a-0b0b0b0b0b0b');

    const ambiguous = await resolveInHouse(
      { kind: 'artist', name: 'The Artist' },
      sources({
        artistCandidates: async () => [
          {
            name: 'The Artist',
            url: 'https://musicbrainz.org/artist/a',
            mbid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            links: [],
          },
          {
            name: 'The Artist',
            url: 'https://musicbrainz.org/artist/b',
            mbid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            links: [],
          },
        ],
      })
    );
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.candidates).toHaveLength(2);
  });

  it('reports an upstream failure when a source throws', async () => {
    const result = await resolveInHouse(
      {
        kind: 'track',
        url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
      },
      sources({
        trackByUrl: async () => {
          throw new Error('spotify down');
        },
      })
    );
    expect(result).toMatchObject({
      status: 'upstream_error',
      kind: 'track',
      confidence: 0,
    });
  });
});
