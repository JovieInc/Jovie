import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchYouTubeMetadata } from '@/lib/youtube/metadata';

const mockVideoResponse = {
  items: [
    {
      snippet: {
        title: 'Test Music Video',
        thumbnails: {
          maxres: { url: 'https://i.ytimg.com/vi/test/maxresdefault.jpg' },
          high: { url: 'https://i.ytimg.com/vi/test/hqdefault.jpg' },
        },
        channelId: 'UC1234',
        channelTitle: 'Test Artist',
      },
      contentDetails: {
        duration: 'PT4M33S',
      },
    },
  ],
};

const mockPremiereResponse = {
  items: [
    {
      snippet: {
        title: 'Premiere Video',
        thumbnails: {
          high: { url: 'https://i.ytimg.com/vi/test/hqdefault.jpg' },
        },
        channelId: 'UC5678',
        channelTitle: 'Premiere Artist',
      },
      contentDetails: {
        duration: 'PT3M15S',
      },
      liveStreamingDetails: {
        scheduledStartTime: '2026-05-01T18:00:00Z',
      },
    },
  ],
};

describe('fetchYouTubeMetadata', () => {
  beforeEach(() => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns metadata for a valid video', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockVideoResponse), { status: 200 })
    );

    const result = await fetchYouTubeMetadata('testVideoId');

    expect(result).toEqual({
      youtubeVideoId: 'testVideoId',
      youtubeThumbnailUrl: 'https://i.ytimg.com/vi/test/maxresdefault.jpg',
      youtubePremiereDate: undefined,
      youtubeChannelId: 'UC1234',
      youtubeChannelName: 'Test Artist',
      duration: 273, // 4*60 + 33
    });
  });

  it('extracts premiere date from liveStreamingDetails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockPremiereResponse), { status: 200 })
    );

    const result = await fetchYouTubeMetadata('premiereId');

    expect(result?.youtubePremiereDate).toBe('2026-05-01T18:00:00Z');
    expect(result?.duration).toBe(195); // 3*60 + 15
  });

  it('returns null when API key is not configured', async () => {
    vi.stubEnv('YOUTUBE_DATA_API_KEY', '');

    const result = await fetchYouTubeMetadata('testId');

    expect(result).toBeNull();
  });

  it('returns null on API error (rate limit)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limited', { status: 429 })
    );

    const result = await fetchYouTubeMetadata('testId');

    expect(result).toBeNull();
  });

  it('returns null on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('Network error')
    );

    const result = await fetchYouTubeMetadata('testId');

    expect(result).toBeNull();
  });
});
