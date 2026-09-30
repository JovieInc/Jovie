import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const request = vi.fn();
vi.mock('@/lib/musicfetch/resilient-client', () => {
  class MusicfetchRequestError extends Error {
    constructor(
      message: string,
      readonly statusCode?: number
    ) {
      super(message);
    }
  }
  return {
    MusicfetchRequestError,
    musicfetchRequest: (...args: unknown[]) => request(...args),
  };
});

import { prepareReleaseLaunchSchema } from './draft-contract';
import {
  isReleaseProviderUrl,
  resolveAgentRelease,
} from './release-resolution';

const draft = {
  draft_id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
  draft_token: 'private.token',
  goal: 'Launch the single',
};

describe('canonical release URL shapes', () => {
  it.each([
    'https://open.spotify.com/intl-de/track/6habFhsOp2NvshLv26DqMb',
    'https://music.apple.com/us/song/signal-fire/1234',
    'https://www.deezer.com/en/track/1234',
    'https://listen.tidal.com/album/1234',
    'https://tidal.com/browse/track/1234',
    'https://music.amazon.com/albums/B123456789',
    'https://artist.bandcamp.com/track/us',
    'https://audiomack.com/the-artist/song/signal-fire',
    'https://open.qobuz.com/album/123456789',
    'https://play.anghami.com/song/1234',
    'https://www.boomplay.com/albums/1234',
    'https://www.iheart.com/artist/the-artist-123/songs/signal-fire-456',
    'https://www.beatport.com/release/signal-fire/1234',
    'https://s.awa.fm/track/123abc',
    'https://gaana.com/song/signal-fire',
    'https://www.jiosaavn.com/song/signal-fire/abc123',
    'https://www.joox.com/th/single/abc123',
    'https://www.kkbox.com/tw/tc/song/abc123',
    'https://music.yandex.ru/album/123/track/456',
    'https://www.pandora.com/artist/the-artist/signal-fire/ALabc123',
    'https://music.163.com/#/song?id=1234',
    'https://music.line.me/webapp/#/track/abc123',
    'https://soundcloud.com/us/me',
    'https://www.amazon.com/music/player/albums/B00138K0FO',
    'https://audius.co/Audius/audius-cypher-series-vol-2',
    'https://audius.co/benjamintheodore/album/brighter-day-31736',
    'https://m.music-flo.com/detail/track/80046364',
    'https://y.qq.com/n/ryqq/songDetail/004Ti8rT003TaZ',
    'https://trebel.io/track?id=461180168',
  ])('accepts a typed resource with its identity: %s', url => {
    expect(isReleaseProviderUrl(url)).toBe(true);
  });

  it.each([
    'https://www.amazon.com/music/player/artists/B00138K0FO',
    'https://www.amazon.com/dp/B00138K0FO',
    'https://audius.co/the-artist/playlist/my-playlist',
    'https://audius.co/the-artist/reposts',
    'https://audius.co/trending/weekly',
    'https://m.music-flo.com/detail/artist/1234',
    'https://m.music-flo.com/detail/track/',
    'https://y.qq.com/n/ryqq/singer/004Ti8rT003TaZ',
    'https://y.qq.com/n/ryqq/songDetail/',
    'https://trebel.io/track',
    'https://trebel.io/playlist?id=461180168',
    'not a URL',
    'https://example.com/album/1234',
    'http://open.spotify.com/album/1234',
    'https://user@open.spotify.com/album/1234',
    'https://open.spotify.com:444/album/1234',
    'https://open.spotify.com/track/',
    'https://open.spotify.com/album/1234/extra',
    'https://music.apple.com/us/album/signal-fire',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=abcdef12345',
    'https://www.youtube.com/watch?v=short',
    'https://open.spotify.com/album/short',
    'https://on.soundcloud.com/artist/track',
    'https://www.youtube.com/playlist?list=123',
    'https://youtu.be/',
    'https://youtu.be/foo/bar',
    'https://soundcloud.com/the-artist/tracks',
    'https://soundcloud.com/the-artist/sets',
    'https://soundcloud.com/the-artist/reposts',
    'https://soundcloud.com/discover/sets',
    'https://soundcloud.com/the-artist/%6cikes',
    'https://www.deezer.com/album/',
    'https://www.deezer.com/artist/1234',
    'https://music.163.com/#/playlist?id=1234',
    'https://music.line.me/webapp/#/playlist/abc123',
    'https://www.pandora.com/artist/the-artist/ARabc123',
    'https://www.pandora.com/playlist/PLabc123',
    'https://music.yandex.ru/users/name/playlists/1234',
  ])('rejects an untyped, malformed or listing resource: %s', url => {
    expect(isReleaseProviderUrl(url)).toBe(false);
  });
});

describe('agent release resolution', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resolves a DSP URL into normalized public release and smart-link facts', async () => {
    request.mockResolvedValue({
      result: {
        type: 'album',
        name: 'Signal Fire',
        releaseDate: '2026-11-07T00:00:00.000Z',
        upc: '00123456789012',
        image: { url: 'https://i.scdn.co/image/cover' },
        artists: [
          {
            name: 'The Artist',
            services: { spotify: { id: 'artist-id' } },
          },
        ],
        services: {
          spotify: {
            url: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
          },
          appleMusic: {
            link: 'https://music.apple.com/us/album/signal-fire/1234',
          },
          genius: { url: 'https://genius.com/albums/not-a-listen-dsp' },
        },
      },
    });
    const input = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
    });

    await expect(resolveAgentRelease(input)).resolves.toEqual({
      status: 'resolved',
      facts: [
        {
          source: 'release_url',
          content_type: 'album',
          title: 'Signal Fire',
          artist_name: 'The Artist',
          release_date: '2026-11-07',
          artwork_url: 'https://i.scdn.co/image/cover',
          upc: '00123456789012',
          dsp_links: {
            spotify: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
            apple_music: 'https://music.apple.com/us/album/signal-fire/1234',
          },
          artists: [{ name: 'The Artist', ids: { spotify: 'artist-id' } }],
        },
      ],
    });
    expect(request).toHaveBeenCalledWith('/url', expect.any(URLSearchParams), {
      timeoutMs: 15_000,
    });
  });

  it('uses the requested UPC when the provider omits it', async () => {
    request.mockResolvedValue({
      result: {
        type: 'album',
        name: 'Signal Fire',
        artists: [{ name: 'The Artist' }],
        services: {},
      },
    });
    const input = prepareReleaseLaunchSchema.parse({
      ...draft,
      upc: '00123456789012',
    });
    const result = await resolveAgentRelease(input);
    expect(result).toMatchObject({
      status: 'resolved',
      facts: [{ source: 'upc', upc: '00123456789012' }],
    });
    const params = request.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('upc')).toBe('00123456789012');
  });

  it('accepts metadata without an upstream call and rejects untrusted DSP keys', async () => {
    const valid = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_metadata: {
        title: 'Signal Fire',
        artist_name: 'The Artist',
        dsp_links: {
          spotify: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
        },
      },
    });
    expect(await resolveAgentRelease(valid)).toMatchObject({
      status: 'resolved',
      facts: [
        {
          source: 'release_metadata',
          title: 'Signal Fire',
          dsp_links: {
            spotify: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
          },
        },
      ],
    });
    const invalid = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_metadata: {
        dsp_links: { spotify: 'https://attacker.example/album/1' },
      },
    });
    expect(await resolveAgentRelease(invalid)).toMatchObject({
      status: 'error',
      code: 'INVALID_INPUT',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects search, artist and playlist pages as release links on every input path', async () => {
    const nonRelease = [
      'https://open.spotify.com/search/anything',
      'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      'https://music.apple.com/us/artist/the-artist/1234',
      'https://soundcloud.com/the-artist',
      'https://open.spotify.com/track',
      'https://open.spotify.com/foo/bar',
      'https://soundcloud.com/the-artist/sets/my-playlist',
      'https://soundcloud.com/the-artist/likes',
      'https://www.youtube.com/@artist/videos',
    ];
    for (const url of nonRelease) {
      const metadata = prepareReleaseLaunchSchema.parse({
        ...draft,
        release_metadata: {
          title: 'Signal Fire',
          artist_name: 'The Artist',
          dsp_links: {
            [url.includes('spotify')
              ? 'spotify'
              : url.includes('apple')
                ? 'apple_music'
                : url.includes('youtube')
                  ? 'youtube'
                  : 'soundcloud']: url,
          },
        },
      });
      expect(await resolveAgentRelease(metadata)).toMatchObject({
        status: 'error',
        code: 'INVALID_INPUT',
      });
      const direct = prepareReleaseLaunchSchema.parse({
        ...draft,
        release_url: url,
      });
      expect(await resolveAgentRelease(direct)).toMatchObject({
        status: 'error',
        code: 'UNSUPPORTED_RELEASE',
      });
    }
    expect(request).not.toHaveBeenCalled();

    for (const url of [
      'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
      'https://open.spotify.com/track/6habFhsOp2NvshLv26DqMb',
      'https://music.apple.com/us/album/signal-fire/1234?i=5678',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://soundcloud.com/the-artist/signal-fire',
    ]) {
      request.mockResolvedValueOnce({
        result: {
          type: 'track',
          name: 'Signal Fire',
          artists: [{ name: 'The Artist' }],
          services: {},
        },
      });
      const input = prepareReleaseLaunchSchema.parse({
        ...draft,
        release_url: url,
      });
      expect(await resolveAgentRelease(input)).toMatchObject({
        status: 'resolved',
        facts: [
          {
            dsp_links: expect.objectContaining({
              [url.includes('spotify')
                ? 'spotify'
                : url.includes('apple')
                  ? 'apple_music'
                  : url.includes('music.youtube')
                    ? 'youtube_music'
                    : url.includes('youtu')
                      ? 'youtube'
                      : 'soundcloud']: url,
            }),
          },
        ],
      });
    }
  });

  it('drops non-release upstream and source links from smart-link facts', async () => {
    request.mockResolvedValue({
      result: {
        type: 'album',
        name: 'Signal Fire',
        artists: [{ name: 'The Artist' }],
        services: {
          spotify: { url: 'https://open.spotify.com/search/anything' },
          deezer: { url: 'https://www.deezer.com/album/1234' },
        },
      },
    });
    const input = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
    });
    const result = await resolveAgentRelease(input);
    expect(result).toMatchObject({
      status: 'resolved',
      facts: [
        {
          dsp_links: {
            deezer: 'https://www.deezer.com/album/1234',
            spotify: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
          },
        },
      ],
    });
  });

  it('rejects unsupported URLs and separates permanent from retryable provider failures', async () => {
    const unsupported = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://example.com/release/1',
    });
    expect(await resolveAgentRelease(unsupported)).toEqual({
      status: 'error',
      code: 'UNSUPPORTED_RELEASE',
      retryable: false,
    });
    const supported = prepareReleaseLaunchSchema.parse({
      ...draft,
      release_url: 'https://open.spotify.com/album/6habFhsOp2NvshLv26DqMb',
    });
    const { MusicfetchRequestError } = await import(
      '@/lib/musicfetch/resilient-client'
    );
    request.mockRejectedValueOnce(new MusicfetchRequestError('bad URL', 400));
    expect(await resolveAgentRelease(supported)).toMatchObject({
      code: 'RELEASE_NOT_FOUND',
      retryable: false,
    });
    request.mockRejectedValueOnce(new MusicfetchRequestError('timeout'));
    expect(await resolveAgentRelease(supported)).toMatchObject({
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
  });
});
