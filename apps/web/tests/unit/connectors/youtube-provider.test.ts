import { describe, expect, it, vi } from 'vitest';
import {
  createYouTubeLibraryProvider,
  listOwnedYouTubeChannels,
  YouTubeProviderError,
} from '@/lib/connectors/youtube/provider';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('YouTube Library provider', () => {
  it('resolves only channels owned by the authorized account', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 'channel-1',
            snippet: { title: 'Artist channel' },
            contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
          },
        ],
      })
    );

    await expect(
      listOwnedYouTubeChannels({
        accessToken: 'access-token',
        fetcher,
      })
    ).resolves.toEqual([
      {
        id: 'channel-1',
        title: 'Artist channel',
        uploadsPlaylistId: 'uploads-1',
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: expect.any(URLSearchParams),
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
      })
    );
  });

  it('paginates uploads and returns canonical video metadata', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/channels')) {
        return jsonResponse({
          items: [
            {
              id: 'channel-1',
              snippet: { title: 'Artist channel' },
              contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
            },
          ],
        });
      }
      if (url.pathname.endsWith('/playlistItems')) {
        return jsonResponse(
          url.searchParams.has('pageToken')
            ? { items: [{ contentDetails: { videoId: 'video-2' } }] }
            : {
                items: [{ contentDetails: { videoId: 'video-1' } }],
                nextPageToken: 'page-2',
              }
        );
      }
      return jsonResponse({
        items: url.searchParams
          .get('id')
          ?.split(',')
          .map((id, index) => ({
            id,
            snippet: {
              channelId: 'channel-1',
              title: `Video ${index + 1}`,
              description: 'ISRC USABC1234567',
              publishedAt: '2026-08-01T00:00:00.000Z',
              thumbnails: { high: { url: `https://img.test/${id}.jpg` } },
            },
            contentDetails: { duration: 'PT3M5S' },
            status: { privacyStatus: 'public' },
          })),
      });
    });
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      fetcher,
    });

    const videos = await provider.listChannelVideos('channel-1');

    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      channelId: 'channel-1',
      videoId: 'video-1',
      durationSeconds: 185,
      privacyStatus: 'public',
    });
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).includes('/playlistItems')
      )
    ).toHaveLength(2);
  });

  it('caps upload pagination when a sync video limit is configured', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/channels')) {
        return jsonResponse({
          items: [
            {
              id: 'channel-1',
              snippet: { title: 'Artist channel' },
              contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
            },
          ],
        });
      }
      if (url.pathname.endsWith('/playlistItems')) {
        return jsonResponse({
          items: [
            { contentDetails: { videoId: 'video-1' } },
            { contentDetails: { videoId: 'video-2' } },
          ],
          nextPageToken: 'page-2',
        });
      }
      return jsonResponse({
        items: url.searchParams
          .get('id')
          ?.split(',')
          .map(id => ({
            id,
            snippet: {
              channelId: 'channel-1',
              title: id,
              thumbnails: {},
            },
            contentDetails: { duration: 'PT1M' },
            status: { privacyStatus: 'public' },
          })),
      });
    });
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      fetcher,
      maxVideosPerSync: 1,
    });

    const videos = await provider.listChannelVideos('channel-1');

    expect(videos.map(video => video.videoId)).toEqual(['video-1']);
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).includes('/playlistItems')
      )
    ).toHaveLength(1);
    const detailCall = fetcher.mock.calls.find(([input]) =>
      String(input).includes('/videos')
    );
    expect(detailCall).toBeDefined();
    expect(new URL(String(detailCall?.[0])).searchParams.get('id')).toBe(
      'video-1'
    );
  });

  it('resumes capped upload pagination from a stored page token', async () => {
    const onUploadsPageToken = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/channels')) {
        return jsonResponse({
          items: [
            {
              id: 'channel-1',
              snippet: { title: 'Artist channel' },
              contentDetails: { relatedPlaylists: { uploads: 'uploads-1' } },
            },
          ],
        });
      }
      if (url.pathname.endsWith('/playlistItems')) {
        expect(url.searchParams.get('pageToken')).toBe('page-2');
        expect(url.searchParams.get('maxResults')).toBe('1');
        return jsonResponse({
          items: [{ contentDetails: { videoId: 'video-2' } }],
          nextPageToken: 'page-3',
        });
      }
      return jsonResponse({
        items: [
          {
            id: 'video-2',
            snippet: {
              channelId: 'channel-1',
              title: 'Video 2',
              thumbnails: {},
            },
            contentDetails: { duration: 'PT1M' },
            status: { privacyStatus: 'public' },
          },
        ],
      });
    });
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      fetcher,
      maxVideosPerSync: 1,
      uploadsPageToken: 'page-2',
      onUploadsPageToken,
    });

    const videos = await provider.listChannelVideos('channel-1');

    expect(videos.map(video => video.videoId)).toEqual(['video-2']);
    expect(onUploadsPageToken).toHaveBeenCalledWith('page-3');
    const detailCall = fetcher.mock.calls.find(([input]) =>
      String(input).includes('/videos')
    );
    expect(new URL(String(detailCall?.[0])).searchParams.get('id')).toBe(
      'video-2'
    );
  });

  it('fails closed when the authorized account does not own the channel', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: 'different-channel',
            contentDetails: { relatedPlaylists: { uploads: 'uploads-2' } },
          },
        ],
      })
    );
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      fetcher,
    });

    await expect(provider.listChannelVideos('channel-1')).rejects.toMatchObject(
      {
        name: YouTubeProviderError.name,
        status: 403,
      }
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('surfaces provider status without leaking the access token', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'token access-token rejected' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
    );

    const result = listOwnedYouTubeChannels({
      accessToken: 'access-token',
      fetcher,
    });

    await expect(result).rejects.toMatchObject({
      name: YouTubeProviderError.name,
      status: 401,
      message: 'YouTube channel lookup failed with status 401',
    });
    await expect(result).rejects.not.toThrow(/access-token/);
  });

  it('maps supported Analytics metrics without inventing impressions', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        columnHeaders: [
          { name: 'video' },
          { name: 'views' },
          { name: 'estimatedMinutesWatched' },
          { name: 'averageViewDuration' },
        ],
        rows: [['video-1', 1200, 3600, 180]],
      })
    );
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      fetcher,
    });

    const metrics = await provider.fetchVideoMetrics(
      'channel-1',
      ['video-1'],
      ['day_7']
    );

    expect(metrics).toEqual([
      {
        videoId: 'video-1',
        window: 'day_7',
        windowStart: new Date('2026-08-21T00:00:00.000Z'),
        windowEnd: new Date('2026-08-27T00:00:00.000Z'),
        impressions: null,
        ctr: null,
        views: 1200,
        watchTimeMinutes: 3600,
        watchTimePerImpression: null,
        avgViewDurationSeconds: 180,
        trafficSources: null,
      },
    ]);
  });

  it('bounds lifetime batches by the Analytics report cell limit', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        columnHeaders: [{ name: 'video' }],
        rows: [],
      })
    );
    const provider = createYouTubeLibraryProvider({
      accessToken: 'access-token',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      fetcher,
    });

    await provider.fetchVideoMetrics(
      'channel-1',
      Array.from({ length: 7 }, (_, index) => `video-${index + 1}`),
      ['lifetime']
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.map(([input]) =>
        new URL(String(input)).searchParams
          .get('filters')
          ?.replace('video==', '')
          .split(',')
      )
    ).toEqual([
      ['video-1', 'video-2', 'video-3', 'video-4', 'video-5', 'video-6'],
      ['video-7'],
    ]);
  });
});
