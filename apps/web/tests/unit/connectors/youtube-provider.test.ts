import { describe, expect, it, vi } from 'vitest';
import {
  createYouTubeLibraryProvider,
  listOwnedYouTubeChannels,
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
});
