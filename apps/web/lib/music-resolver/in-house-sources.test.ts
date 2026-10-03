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
    fetchMock.mockResolvedValue(json({ results: [] }));
    mocks.isSpotifyAvailable.mockReturnValue(true);
    mocks.lookupAppleMusicByIsrc.mockResolvedValue(null);
    mocks.lookupDeezerByIsrc.mockResolvedValue(null);
    mocks.lookupSpotifyByIsrc.mockResolvedValue(null);
    mocks.lookupMusicBrainzReleaseByBarcode.mockResolvedValue(null);
    mocks.matchMusicBrainzArtistByName.mockResolvedValue({ status: 'none' });
    mocks.getMusicBrainzArtist.mockResolvedValue(null);
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
              trackName: 'Apple Song',
              artistName: 'Apple Artist',
              trackViewUrl:
                'http://itunes.apple.com/us/album/apple-song/123?i=456&uo=4',
              isrc: 'usapple12345',
            },
          ],
        });
      }
      return json({
        title: 'Deezer Song',
        artist: { name: 'Deezer Artist' },
        link: 'http://www.deezer.com/track/789',
        isrc: 'usdeezer1234',
      });
    });
    mocks.spotifyRequestJson.mockResolvedValue({
      name: 'Spotify Song',
      external_ids: { isrc: 'usspotify123' },
      artists: [{ name: 'Spotify Artist' }],
    });
    const sources = createDefaultInHouseSources();

    await expect(
      sources.trackByUrl('https://music.apple.com/us/album/example/123')
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'apple_music',
        title: 'Apple Song',
        isrc: 'USAPPLE12345',
      })
    );
    await expect(
      sources.trackByUrl('https://www.deezer.com/track/789')
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'deezer',
        title: 'Deezer Song',
        isrc: 'USDEEZER1234',
      })
    );
    await expect(
      sources.trackByUrl(`https://open.spotify.com/track/${SPOTIFY_ID}`)
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'spotify',
        title: 'Spotify Song',
        isrc: 'USSPOTIFY123',
      })
    );
  });

  it('returns a stable Spotify URL result when metadata is unavailable', async () => {
    mocks.isSpotifyAvailable.mockReturnValue(false);

    await expect(
      createDefaultInHouseSources().trackByUrl(
        `https://open.spotify.com/track/${SPOTIFY_ID}`
      )
    ).resolves.toEqual({
      provider: 'spotify',
      title: SPOTIFY_ID,
      artist: '',
      url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
      isrc: null,
      upc: null,
      provenance: 'input_url',
      confidence: 0.95,
    });
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
      sources.albumByUrl('https://music.apple.com/us/album/example/123')
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'apple_music',
        provenance: 'input_url',
      })
    );
    await expect(sources.searchAlbums('Artist', 'Album')).resolves.toEqual([
      expect.objectContaining({
        title: 'Album',
        provenance: 'exact_name',
      }),
    ]);
    await expect(
      sources.albumByUrl('https://www.deezer.com/album/456')
    ).resolves.toEqual(
      expect.objectContaining({ provider: 'deezer', title: 'deezer' })
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
    });

    await expect(
      createDefaultInHouseSources().artistCandidates('Artist')
    ).resolves.toEqual([
      expect.objectContaining({ mbid: 'ambiguous-0' }),
      expect.objectContaining({ mbid: 'ambiguous-1' }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves artist URLs, MBIDs, and recording url-rels', async () => {
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
    ).resolves.toEqual(
      expect.objectContaining({
        mbid: null,
        links: [expect.objectContaining({ provider: 'apple_music' })],
      })
    );
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
    await expect(sources.artistByMbid(MBID)).resolves.toBeNull();
    await expect(sources.urlRelsForIsrc('US-FAIL-12-34567')).resolves.toEqual(
      []
    );
  });
});
