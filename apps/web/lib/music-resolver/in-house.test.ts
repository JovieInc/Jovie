import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  type InHouseSources,
  PROVENANCE_CONFIDENCE,
  resolveInHouse,
  sameCatalogName,
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
    artistByUrl: async () => [],
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
  afterEach(() => vi.unstubAllGlobals());
  it('loads the default source adapter when no source is injected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 404 }))
    );
    const result = await resolveInHouse({
      kind: 'artist',
      url: 'https://music.apple.com/us/artist/the-artist/42',
    });

    expect(result).toMatchObject({
      status: 'no_match',
      kind: 'artist',
      links: [],
      confidence: 0,
    });
  });

  it.each([
    ['東京', '大阪', false],
    ['!!!', '???', false],
    ['', '', false],
    ['&', 'and', false],
    ['\u0301', '\u0301', false],
    ['東京', ' 東京 ', true],
    ['Мир', 'мир', true],
    ['محمد', 'محمد', true],
    ['हिंदी', 'हिंदी', true],
    ['हिंदी', 'हदी', false],
    ['عَلَم', 'عِلْم', false],
    ['Café', 'Cafe\u0301', true],
    ['Café', 'Cafe', false],
    ['ＡＢＣ', 'abc', true],
    ['A & B', 'a and b', true],
    ['Signal—Fire!', 'signal fire', true],
    ['PAPA', 'РАРА', false],
  ])('compares catalog names %s / %s safely', (left, right, expected) => {
    expect(sameCatalogName(left, right)).toBe(expected);
  });

  it.each([
    ['東京', '大阪'],
    ['!!!', '???'],
    ['हिंदी', 'हदी'],
  ])(
    'does not resolve a distinct Unicode or empty-normalized artist %s / %s',
    async (artist, foundArtist) => {
      const result = await resolveInHouse(
        { kind: 'track', artist, title: 'Signal Fire' },
        sources({
          searchTracks: async () => [{ ...apple, artist: foundArtist }],
        })
      );
      expect(result).toMatchObject({
        status: 'no_match',
        links: [],
        confidence: 0,
      });
    }
  );

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

  it('does not merge unrelated same-name Apple artists into a MusicBrainz identity', async () => {
    const related = {
      name: 'Tim White',
      mbid: '51972833-bb04-46b7-9401-45a5ab449ebd',
      url: 'https://music.apple.com/us/artist/859547284',
      links: [
        {
          provider: 'apple_music',
          url: 'https://music.apple.com/us/artist/859547284',
          provenance: 'musicbrainz_url_rel',
          confidence: 0.8,
        },
      ],
    };
    const stranger = {
      name: 'Tim White',
      mbid: null,
      url: 'https://music.apple.com/us/artist/999',
      links: [
        {
          provider: 'apple_music',
          url: 'https://music.apple.com/us/artist/999',
          provenance: 'exact_name',
          confidence: 0.72,
        },
      ],
    };
    const result = await resolveInHouse(
      { kind: 'artist', name: 'Tim White' },
      sources({ artistCandidates: async () => [related, stranger] })
    );
    expect(result.status).toBe('ambiguous');
    expect(result.mbid).toBeNull();
    expect(result.links).toEqual([]);
    expect(result.candidates.map(candidate => candidate.url)).toEqual([
      related.url,
      stranger.url,
    ]);
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
  it('resolves a track URL through its stable ISRC while preserving the input link', async () => {
    const result = await resolveInHouse(
      { kind: 'track', url: apple.url, territory: 'GB' },
      sources({
        trackByUrl: async () => ({
          ...apple,
          provenance: 'input_url',
          confidence: 0.95,
        }),
        trackByIsrc: async (isrc, territory) => {
          expect([isrc, territory]).toEqual([apple.isrc, 'GB']);
          return [
            {
              ...apple,
              provider: 'deezer',
              url: 'https://www.deezer.com/track/99',
            },
          ];
        },
      })
    );
    expect(result).toMatchObject({
      status: 'resolved',
      title: apple.title,
      isrc: apple.isrc,
      confidence: 0.95,
    });
    expect(result.links.map(link => link.provider)).toEqual([
      'apple_music',
      'deezer',
    ]);
  });

  it('keeps a URL-only track without inventing an ISRC or cross-provider equivalence', async () => {
    const fanout = vi.fn();
    const result = await resolveInHouse(
      { kind: 'track', url: apple.url },
      sources({
        trackByUrl: async () => ({ ...apple, isrc: null }),
        trackByIsrc: fanout,
      })
    );
    expect(result).toMatchObject({ status: 'resolved', isrc: null });
    expect(result.links).toHaveLength(1);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('keeps distinct recording identifiers ambiguous even with identical titles', async () => {
    const fanout = vi.fn();
    const result = await resolveInHouse(
      { kind: 'track', artist: apple.artist, title: apple.title },
      sources({
        searchTracks: async () => [apple, { ...apple, isrc: 'USABC1234567' }],
        trackByIsrc: fanout,
      })
    );
    expect(result.status).toBe('ambiguous');
    expect(result.isrc).toBeNull();
    expect(result.links).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('normalizes exact artist/title searches and deduplicates provider links by evidence', async () => {
    const result = await resolveInHouse(
      { kind: 'track', artist: 'The ARTIST', title: 'Signal Fire' },
      sources({
        searchTracks: async () => [{ ...apple, confidence: 0.72 }],
        trackByIsrc: async () => [
          apple,
          {
            ...apple,
            url: 'https://music.apple.com/us/song/duplicate/456',
            confidence: 0.7,
          },
        ],
      })
    );
    expect(result.status).toBe('resolved');
    expect(result.links).toEqual([
      expect.objectContaining({ url: apple.url, confidence: 0.92 }),
    ]);
  });

  it('does not attach same-title results from a different artist', async () => {
    const result = await resolveInHouse(
      { kind: 'track', artist: 'Tim White', title: apple.title },
      sources({ searchTracks: async () => [apple] })
    );
    expect(result.status).toBe('no_match');
    expect(result.links).toEqual([]);
    expect(result.candidateCount).toBe(1);
  });

  const album = {
    provider: 'apple_music',
    title: 'Album',
    artist: 'Tim White',
    url: 'https://music.apple.com/us/album/123',
    upc: '123456789012',
    provenance: 'upc_exact',
    confidence: 0.92,
  };

  it('resolves an album URL and preserves its stable barcode', async () => {
    const result = await resolveInHouse(
      { kind: 'album', url: album.url },
      sources({ albumByUrl: async () => album })
    );
    expect(result).toMatchObject({
      status: 'resolved',
      title: 'Album',
      upc: album.upc,
    });
    expect(result.links).toEqual([expect.objectContaining({ url: album.url })]);
  });

  it('resolves an exact album search but keeps distinct releases ambiguous', async () => {
    const query = {
      kind: 'album' as const,
      artist: 'Tim White',
      title: 'Album',
    };
    const resolved = await resolveInHouse(
      query,
      sources({ searchAlbums: async () => [album] })
    );
    expect(resolved).toMatchObject({ status: 'resolved', upc: album.upc });
    const ambiguous = await resolveInHouse(
      query,
      sources({
        searchAlbums: async () => [
          album,
          {
            ...album,
            upc: '999999999999',
            url: 'https://music.apple.com/us/album/456',
          },
        ],
      })
    );
    expect(ambiguous).toMatchObject({
      status: 'ambiguous',
      upc: null,
      links: [],
    });
    expect(ambiguous.candidates).toHaveLength(2);
    const edition = await resolveInHouse(
      query,
      sources({
        searchAlbums: async () => [{ ...album, title: 'Album (Deluxe)' }],
      })
    );
    expect(edition.status).toBe('ambiguous');
    expect(edition.candidates).toHaveLength(1);
  });

  it('merges only the Apple ID explicitly linked by MusicBrainz despite storefront/name variations', async () => {
    const result = await resolveInHouse(
      { kind: 'artist', name: 'Tim White' },
      sources({
        artistCandidates: async () => [
          {
            name: 'Tim White',
            mbid: '51972833-bb04-46b7-9401-45a5ab449ebd',
            url: 'https://musicbrainz.org/artist/51972833-bb04-46b7-9401-45a5ab449ebd',
            links: [
              {
                provider: 'apple_music',
                url: 'https://itunes.apple.com/us/artist/id859547284',
                confidence: 0.8,
                provenance: 'musicbrainz_url_rel',
              },
            ],
          },
          {
            name: 'Tim White',
            mbid: null,
            url: 'https://music.apple.com/gb/artist/tim-white/859547284?at=tracking',
            links: [
              {
                provider: 'apple_music',
                url: 'https://music.apple.com/gb/artist/tim-white/859547284',
                confidence: 0.72,
                provenance: 'exact_name',
              },
            ],
          },
        ],
      })
    );
    expect(result).toMatchObject({
      status: 'resolved',
      mbid: '51972833-bb04-46b7-9401-45a5ab449ebd',
    });
    expect(result.links).toHaveLength(1);
    expect(result.links[0].provenance).toBe('musicbrainz_url_rel');
  });

  it('keeps same-name provider-only artists as real choices', async () => {
    const result = await resolveInHouse(
      { kind: 'artist', name: 'Tim White' },
      sources({
        artistCandidates: async () => [
          {
            name: 'Tim White',
            mbid: null,
            url: 'https://music.apple.com/us/artist/123',
            links: [],
          },
          {
            name: 'Tim White',
            mbid: null,
            url: 'https://music.apple.com/us/artist/456',
            links: [],
          },
        ],
      })
    );
    expect(result).toMatchObject({
      status: 'ambiguous',
      mbid: null,
      links: [],
    });
    expect(result.candidates).toHaveLength(2);
  });

  it.each([
    { kind: 'track' as const, isrc: 'USABC1234567' },
    { kind: 'track' as const, url: apple.url },
    { kind: 'album' as const, upc: album.upc },
    { kind: 'album' as const, url: album.url },
    { kind: 'album' as const, artist: 'Wrong Artist', title: 'Album' },
    { kind: 'artist' as const, name: 'Absent Artist' },
    { kind: 'artist' as const, url: 'https://example.com/artist' },
    { kind: 'artist' as const, mbid: '51972833-bb04-46b7-9401-45a5ab449ebd' },
  ])('reports no match without fabricated identity: %j', async query => {
    const result = await resolveInHouse(query, sources());
    expect(result).toMatchObject({
      status: 'no_match',
      mbid: null,
      links: [],
      confidence: 0,
    });
  });
});
