import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  listRecentPublicVideos,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
  type YouTubeChannelRef,
  YouTubeDataApiUnavailableError,
} from '@/lib/youtube/resolve-channel';

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseYouTubeChannelInput', () => {
  const parseCases: ReadonlyArray<readonly [string, YouTubeChannelRef]> = [
    ['@itstimwhite', { kind: 'handle', value: 'itstimwhite' }],
    ['itstimwhite', { kind: 'handle', value: 'itstimwhite' }],
    ['  @Its.Tim_White-1  ', { kind: 'handle', value: 'Its.Tim_White-1' }],
    [
      'https://www.youtube.com/@itstimwhite',
      { kind: 'handle', value: 'itstimwhite' },
    ],
    [
      'youtube.com/@itstimwhite/videos',
      { kind: 'handle', value: 'itstimwhite' },
    ],
    [
      'https://m.youtube.com/c/timwhite',
      { kind: 'username', value: 'timwhite' },
    ],
    [
      'https://youtube.com/user/timwhite',
      { kind: 'username', value: 'timwhite' },
    ],
    [
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      { kind: 'id', value: 'UCabcdefghijklmnopqrstuv' },
    ],
    [
      'UCabcdefghijklmnopqrstuv',
      { kind: 'id', value: 'UCabcdefghijklmnopqrstuv' },
    ],
  ];

  it.each(
    parseCases.map(([input, expected]) => ({ input, expected }))
  )('parses $input', ({ input, expected }) => {
    expect(parseYouTubeChannelInput(input)).toEqual(expected);
  });

  const rejectCases: readonly string[] = [
    '',
    '   ',
    '@',
    'ab',
    'has spaces here',
    '<script>alert(1)</script>',
    'https://vimeo.com/@someone',
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/channel/not-an-id',
    'x'.repeat(201),
  ];

  it.each(rejectCases.map(input => ({ input })))('rejects $input', ({
    input,
  }) => {
    expect(parseYouTubeChannelInput(input)).toBeNull();
  });
});

describe('resolveYouTubeChannel / listRecentPublicVideos', () => {
  const originalKey = process.env.YOUTUBE_DATA_API_KEY;

  beforeEach(() => {
    process.env.YOUTUBE_DATA_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.YOUTUBE_DATA_API_KEY;
    } else {
      process.env.YOUTUBE_DATA_API_KEY = originalKey;
    }
  });

  it('fails closed when the Data API key is missing', async () => {
    delete process.env.YOUTUBE_DATA_API_KEY;
    await expect(
      resolveYouTubeChannel({ kind: 'handle', value: 'x' }, vi.fn())
    ).rejects.toBeInstanceOf(YouTubeDataApiUnavailableError);
  });

  it('resolves a handle via channels.list forHandle and returns the uploads playlist', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonOk({
        items: [
          {
            id: 'UC123',
            snippet: { title: 'Tim White', customUrl: '@itstimwhite' },
            contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
          },
        ],
      })
    );

    const channel = await resolveYouTubeChannel(
      { kind: 'handle', value: 'itstimwhite' },
      fetchImpl as never
    );

    expect(channel).toEqual({
      channelId: 'UC123',
      title: 'Tim White',
      handle: 'itstimwhite',
      uploadsPlaylistId: 'UU123',
    });
    const requested = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe('/youtube/v3/channels');
    expect(requested.searchParams.get('forHandle')).toBe('@itstimwhite');
    expect(requested.searchParams.get('key')).toBe('test-key');
  });

  it('returns null for an unknown channel instead of throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonOk({ items: [] }));
    await expect(
      resolveYouTubeChannel({ kind: 'id', value: 'UCnope' }, fetchImpl as never)
    ).resolves.toBeNull();
  });

  it('lists the newest public videos with a thumbnail, capped at the limit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonOk({
          items: [
            { contentDetails: { videoId: 'old' } },
            { contentDetails: { videoId: 'new' } },
            { contentDetails: { videoId: 'private' } },
            { contentDetails: { videoId: 'mid' } },
            { contentDetails: { videoId: 'nothumb' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonOk({
          items: [
            {
              id: 'old',
              snippet: {
                title: 'Old',
                publishedAt: '2026-01-01T00:00:00Z',
                thumbnails: { high: { url: 'https://i/old.jpg' } },
              },
              status: { privacyStatus: 'public' },
            },
            {
              id: 'new',
              snippet: {
                title: 'New',
                publishedAt: '2026-09-01T00:00:00Z',
                thumbnails: { maxres: { url: 'https://i/new.jpg' } },
              },
              status: { privacyStatus: 'public' },
            },
            {
              id: 'private',
              snippet: {
                title: 'Private',
                publishedAt: '2026-08-01T00:00:00Z',
                thumbnails: { high: { url: 'https://i/private.jpg' } },
              },
              status: { privacyStatus: 'private' },
            },
            {
              id: 'mid',
              snippet: {
                title: 'Mid',
                publishedAt: '2026-06-01T00:00:00Z',
                thumbnails: { medium: { url: 'https://i/mid.jpg' } },
              },
              status: { privacyStatus: 'public' },
            },
            {
              id: 'nothumb',
              snippet: {
                title: 'No thumb',
                publishedAt: '2026-07-01T00:00:00Z',
              },
              status: { privacyStatus: 'public' },
            },
          ],
        })
      );

    const videos = await listRecentPublicVideos('UU123', 2, fetchImpl as never);

    expect(videos.map(video => video.videoId)).toEqual(['new', 'mid']);
    expect(videos[0]?.thumbnailUrl).toBe('https://i/new.jpg');
  });
});
