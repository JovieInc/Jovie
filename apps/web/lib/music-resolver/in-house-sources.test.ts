import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getMusicBrainzArtist: vi.fn(),
  isSpotifyAvailable: vi.fn(),
  lookupAppleMusicByIsrc: vi.fn(),
  lookupDeezerByIsrc: vi.fn(),
  lookupMusicBrainzRecordingUrlRels: vi.fn(),
  lookupMusicBrainzReleaseByBarcode: vi.fn(),
  lookupSpotifyByIsrc: vi.fn(),
  matchMusicBrainzArtistByName: vi.fn(),
  lookupMusicBrainzArtistsByUrl: vi.fn(),
  spotifyRequestJson: vi.fn(),
}));

vi.mock('@/lib/discography/provider-links', () => ({
  lookupAppleMusicByIsrc: mocks.lookupAppleMusicByIsrc,
  lookupDeezerByIsrc: mocks.lookupDeezerByIsrc,
  lookupSpotifyByIsrc: mocks.lookupSpotifyByIsrc,
}));

vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mocks.isSpotifyAvailable,
  spotifyClient: { requestJson: mocks.spotifyRequestJson },
}));

vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  getMusicBrainzArtist: mocks.getMusicBrainzArtist,
  lookupMusicBrainzRecordingUrlRels: mocks.lookupMusicBrainzRecordingUrlRels,
  lookupMusicBrainzReleaseByBarcode: mocks.lookupMusicBrainzReleaseByBarcode,
  matchMusicBrainzArtistByName: mocks.matchMusicBrainzArtistByName,
  lookupMusicBrainzArtistsByUrl: mocks.lookupMusicBrainzArtistsByUrl,
}));

import { createDefaultInHouseSources } from './in-house-sources';

const MBID = '70d4e0a5-27bd-4c3a-b7bd-dc7c9cb1d4aa';
const SPOTIFY_ID = '4Z8W4fKeB5YxbusRsdQVPb';

function relation(resource: string, ended = false) {
  return {
    type: 'streaming music',
    'type-id': 'streaming-music',
    ended,
    url: { id: `url-${resource}`, resource },
  };
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

describe('createDefaultInHouseSources', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => json({ results: [] }));
    mocks.isSpotifyAvailable.mockReturnValue(true);
    mocks.spotifyRequestJson.mockResolvedValue({
      id: SPOTIFY_ID,
      type: 'track',
      name: 'Song',
      artists: [{ name: 'Artist' }],
    });
    mocks.lookupAppleMusicByIsrc.mockResolvedValue(null);
    mocks.lookupDeezerByIsrc.mockResolvedValue(null);
    mocks.lookupSpotifyByIsrc.mockResolvedValue(null);
    mocks.lookupMusicBrainzReleaseByBarcode.mockResolvedValue(null);
    mocks.matchMusicBrainzArtistByName.mockResolvedValue({ status: 'none' });
    mocks.getMusicBrainzArtist.mockResolvedValue(null);
    mocks.lookupMusicBrainzArtistsByUrl.mockResolvedValue([]);
    mocks.lookupMusicBrainzRecordingUrlRels.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fans an ISRC out to Apple Music, Deezer, and Spotify', async () => {
    mocks.lookupAppleMusicByIsrc.mockResolvedValue({
      url: 'http://itunes.apple.com/us/album/example/1?uo=4',
      trackId: '1',
      previewUrl: null,
      trackName: 'Example Song',
      artistName: 'Example Artist',
    });
    mocks.lookupDeezerByIsrc.mockResolvedValue({
      url: 'https://www.deezer.com/track/2',
      trackId: '2',
      albumUrl: null,
      albumId: null,
      previewUrl: null,
    });
    mocks.lookupSpotifyByIsrc.mockResolvedValue({
      url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
      trackId: SPOTIFY_ID,
      previewUrl: null,
    });

    const result = await createDefaultInHouseSources().trackByIsrc(
      'us-abc-12-34567',
      'GB'
    );

    expect(result).toEqual([
      expect.objectContaining({
        provider: 'apple_music',
        title: 'Example Song',
        artist: 'Example Artist',
        isrc: 'us-abc-12-34567',
        url: 'https://music.apple.com/us/album/example/1',
      }),
      expect.objectContaining({ provider: 'deezer' }),
      expect.objectContaining({ provider: 'spotify' }),
    ]);
    expect(mocks.lookupAppleMusicByIsrc).toHaveBeenCalledWith(
      'us-abc-12-34567',
      { storefront: 'gb' }
    );
    expect(mocks.lookupSpotifyByIsrc).toHaveBeenCalledWith('us-abc-12-34567', {
      market: 'GB',
    });
  });

  it('hydrates Apple, Deezer, and Spotify track URLs', async () => {
    fetchMock.mockImplementation(async input => {
      const url = String(input);
      if (url.includes('itunes.apple.com/lookup')) {
        return json({
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              trackId: 456,
              collectionId: 123,
              trackName: 'Apple Song',
              artistName: 'Apple Artist',
              trackViewUrl:
                'http://itunes.apple.com/us/album/apple-song/123?i=456&uo=4',
              isrc: 'usapp1234567',
            },
          ],
        });
      }
      return json({
        id: 789,
        type: 'track',
        title: 'Deezer Song',
        artist: { name: 'Deezer Artist' },
        link: 'http://www.deezer.com/track/789',
        isrc: 'usdez1234567',
      });
    });
    mocks.spotifyRequestJson.mockResolvedValue({
      id: SPOTIFY_ID,
      type: 'track',
      name: 'Spotify Song',
      external_ids: { isrc: 'usspt1234567' },
      artists: [{ name: 'Spotify Artist' }],
    });
    const sources = createDefaultInHouseSources();

    await expect(
      sources.trackByUrl(
        'https://music.apple.com/us/album/example/123?i=456&app=music'
      )
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'apple_music',
        title: 'Apple Song',
        isrc: 'USAPP1234567',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://itunes.apple.com/lookup?id=456&entity=song&country=us',
      expect.any(Object)
    );
    await expect(
      sources.trackByUrl('https://www.deezer.com/track/789')
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'deezer',
        title: 'Deezer Song',
        isrc: 'USDEZ1234567',
      })
    );
    await expect(
      sources.trackByUrl(`https://open.spotify.com/track/${SPOTIFY_ID}`)
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'spotify',
        title: 'Spotify Song',
        isrc: 'USSPT1234567',
      })
    );
  });

  it('reports missing Spotify credentials instead of fabricating a URL result', async () => {
    mocks.isSpotifyAvailable.mockReturnValue(false);

    await expect(
      createDefaultInHouseSources().trackByUrl(
        `https://open.spotify.com/track/${SPOTIFY_ID}`
      )
    ).rejects.toThrow('Spotify catalog source unavailable');
    expect(mocks.spotifyRequestJson).not.toHaveBeenCalled();
  });

  it('searches Apple and Deezer tracks by exact name', async () => {
    fetchMock.mockImplementation(async input =>
      String(input).includes('itunes.apple.com')
        ? json({
            results: [
              {
                trackName: 'Song',
                artistName: 'Artist',
                trackViewUrl: 'https://music.apple.com/us/album/song/1',
                isrc: 'ussearch1234',
              },
              { trackName: null },
            ],
          })
        : json({
            data: [
              {
                title: 'Song',
                artist: { name: 'Artist' },
                link: 'https://www.deezer.com/track/2',
                isrc: 'ussearch5678',
              },
              null,
            ],
          })
    );

    const result = await createDefaultInHouseSources().searchTracks(
      'Artist',
      'Song'
    );

    expect(result).toEqual([
      expect.objectContaining({
        provider: 'apple_music',
        provenance: 'exact_name',
      }),
      expect.objectContaining({
        provider: 'deezer',
        provenance: 'exact_name',
      }),
    ]);
  });

  it('prefers an Apple album for a UPC and falls back to MusicBrainz url-rels', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          results: [
            {
              collectionName: 'Apple Album',
              artistName: 'Apple Artist',
              collectionViewUrl: 'https://music.apple.com/us/album/example/1',
            },
          ],
        })
      )
      .mockResolvedValueOnce(json({ results: [] }));
    mocks.lookupMusicBrainzReleaseByBarcode
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'release-id',
        title: 'MusicBrainz Album',
        artist: 'MusicBrainz Artist',
        barcode: '123456789012',
        relations: [
          relation(`https://open.spotify.com/album/${SPOTIFY_ID}`),
          relation('https://www.deezer.com/album/2', true),
        ],
      });
    const sources = createDefaultInHouseSources();

    await expect(sources.albumByUpc('012345678901')).resolves.toEqual(
      expect.objectContaining({
        provider: 'apple_music',
        title: 'Apple Album',
        upc: '012345678901',
      })
    );
    await expect(sources.albumByUpc('123456789012')).resolves.toEqual(
      expect.objectContaining({
        provider: 'spotify',
        title: 'MusicBrainz Album',
        upc: '123456789012',
      })
    );
  });

  it('resolves and searches albums without fabricating invalid rows', async () => {
    fetchMock.mockImplementation(async () =>
      json({
        results: [
          {
            wrapperType: 'collection',
            collectionType: 'Album',
            collectionId: 123,
            collectionName: 'Album',
            artistName: 'Artist',
            collectionViewUrl:
              'http://itunes.apple.com/us/album/example/123?app=music',
          },
          { collectionName: 'Missing URL', artistName: 'Artist' },
        ],
      })
    );
    const sources = createDefaultInHouseSources();

    await expect(
      sources.albumByUrl(
        'https://music.apple.com/us/album/example/123?i=456&app=music'
      )
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'apple_music',
        provenance: 'input_url',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://itunes.apple.com/lookup?id=123&entity=album&country=us',
      expect.any(Object)
    );
    await expect(sources.searchAlbums('Artist', 'Album')).resolves.toEqual([
      expect.objectContaining({
        title: 'Album',
        provenance: 'exact_name',
      }),
    ]);
    fetchMock.mockResolvedValueOnce(
      json({
        id: 456,
        type: 'album',
        title: 'Deezer Album',
        artist: { name: 'Artist' },
      })
    );
    await expect(
      sources.albumByUrl('https://www.deezer.com/album/456')
    ).resolves.toEqual(
      expect.objectContaining({ provider: 'deezer', title: 'Deezer Album' })
    );
  });

  it('combines a MusicBrainz artist match with Apple artist search results', async () => {
    mocks.matchMusicBrainzArtistByName.mockResolvedValue({
      status: 'found',
      artist: {
        id: MBID,
        name: 'Artist',
        relations: [
          relation('https://www.deezer.com/artist/11'),
          relation('https://example.com/not-a-dsp'),
        ],
      },
    });
    fetchMock.mockResolvedValue(
      json({
        results: [
          {
            artistName: 'Artist',
            artistLinkUrl: 'http://itunes.apple.com/us/artist/artist/22?at=x',
          },
          { artistName: '', artistLinkUrl: 'not-a-url' },
        ],
      })
    );

    const result =
      await createDefaultInHouseSources().artistCandidates('Artist');

    expect(result).toEqual([
      expect.objectContaining({
        mbid: MBID,
        url: 'https://www.deezer.com/artist/11',
      }),
      expect.objectContaining({
        mbid: null,
        url: 'https://music.apple.com/us/artist/artist/22',
      }),
    ]);
  });

  it('preserves ambiguous artist candidates for caller choice', async () => {
    mocks.matchMusicBrainzArtistByName.mockResolvedValue({
      status: 'ambiguous',
      count: 2,
      artists: [
        { id: MBID, name: 'Artist' },
        { id: '8ac57f9f-0188-450a-b177-db336e5c2870', name: 'Artist' },
      ],
    });

    await expect(
      createDefaultInHouseSources().artistCandidates('Artist')
    ).resolves.toEqual([
      expect.objectContaining({ mbid: MBID }),
      expect.objectContaining({ mbid: '8ac57f9f-0188-450a-b177-db336e5c2870' }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves artist URLs, MBIDs, and recording url-rels', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: [
          {
            wrapperType: 'artist',
            artistId: 44,
            artistName: 'Artist',
          },
        ],
      })
    );
    const relations = [
      relation('http://open.spotify.com/artist/artist-id?app=music'),
      relation('https://example.com/not-a-dsp'),
      relation('https://www.deezer.com/artist/33', true),
    ];
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Artist',
      relations,
    });
    mocks.lookupMusicBrainzRecordingUrlRels.mockResolvedValue(relations);
    const sources = createDefaultInHouseSources();

    await expect(
      sources.artistByUrl('https://music.apple.com/us/artist/artist/44')
    ).resolves.toEqual([
      expect.objectContaining({
        mbid: null,
        links: [expect.objectContaining({ provider: 'apple_music' })],
      }),
    ]);
    await expect(sources.artistByMbid(MBID)).resolves.toEqual(
      expect.objectContaining({
        name: 'Artist',
        links: [expect.objectContaining({ provider: 'spotify' })],
      })
    );
    await expect(sources.urlRelsForIsrc('US-REL-12-34567')).resolves.toEqual([
      expect.objectContaining({
        provider: 'spotify',
        provenance: 'musicbrainz_url_rel',
      }),
    ]);
  });

  it('returns null or empty results for invalid URLs and upstream failures', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    mocks.getMusicBrainzArtist.mockRejectedValue(new Error('offline'));
    mocks.lookupMusicBrainzRecordingUrlRels.mockRejectedValue(
      new Error('offline')
    );
    const sources = createDefaultInHouseSources();

    await expect(sources.trackByUrl('not-a-url')).resolves.toBeNull();
    await expect(
      sources.albumByUrl('https://example.com:444/album')
    ).resolves.toBeNull();
    await expect(sources.searchAlbums('Artist', 'Album')).resolves.toEqual([]);
    await expect(sources.artistByMbid(MBID)).rejects.toThrow('offline');
    await expect(sources.urlRelsForIsrc('US-FAIL-12-34567')).resolves.toEqual(
      []
    );
  });
  it('retains storefronts for URL reads and honors explicit territories for searches', async () => {
    const sources = createDefaultInHouseSources();
    await sources.trackByUrl('https://music.apple.com/gb/album/song/123?i=456');
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'id=456&entity=song&country=gb'
    );
    await sources.albumByUrl('https://music.apple.com/ca/album/release/123');
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'id=123&entity=album&country=ca'
    );
    await sources.searchTracks('Tim White', 'Take Me Over', 'GB');
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('entity=song&limit=8&country=gb')
      )
    ).toBe(true);
    await sources.searchAlbums('Tim White', 'Release', 'CA');
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      'entity=album&limit=8&country=ca'
    );
    await sources.albumByUpc('123456789012', 'GB');
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('upc=123456789012&entity=album&country=gb')
      )
    ).toBe(true);
    await sources.trackByUrl(
      `https://open.spotify.com/track/${SPOTIFY_ID}`,
      'GB'
    );
    expect(mocks.spotifyRequestJson).toHaveBeenCalledWith(
      `/tracks/${SPOTIFY_ID}?market=GB`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        redirect: 'error',
      })
    );
  });

  it('rejects track/album URLs and malformed MusicBrainz URLs as artist identities', async () => {
    const sources = createDefaultInHouseSources();
    for (const url of [
      `https://open.spotify.com/track/${SPOTIFY_ID}`,
      'https://music.apple.com/us/album/release/123',
      'https://musicbrainz.org/artist/invalid',
      'file:///etc/passwd',
      ['https://fixture-user', ':fixture-password@example.com'].join(''),
    ]) {
      await expect(sources.artistByUrl(url)).resolves.toEqual([]);
    }
    expect(mocks.lookupMusicBrainzArtistsByUrl).not.toHaveBeenCalled();
    expect(mocks.getMusicBrainzArtist).not.toHaveBeenCalled();
  });

  it('marks an embedded release-group collection as incomplete at the API cap', async () => {
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Artist',
      'release-groups': Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        title: 'Release',
      })),
      aliases: [{ name: 'Alias' }, { name: 'Alias' }],
      relations: [
        relation('https://www.instagram.com/artist/'),
        relation('https://example.com/ended', true),
        relation('javascript:alert(1)'),
        relation(
          ['https://fixture-user', ':fixture-password@example.com'].join('')
        ),
        relation('https://example.com:999/profile'),
      ],
    });
    const result = await createDefaultInHouseSources().artistByMbid(MBID);
    expect(result?.metadata).toMatchObject({
      releaseGroupsComplete: false,
      aliases: ['Alias'],
      externalLinks: [expect.objectContaining({ provider: 'instagram' })],
    });
    expect(result?.metadata?.releaseGroups).toHaveLength(25);
    expect(result?.links).toEqual([]);
  });
});
