import { describe, expect, it, vi } from 'vitest';
import { listYouTubeInboundComments } from './inbound-comments';
import { YouTubeProviderError } from './provider';

const CHANNEL_ID = 'UCchannel-1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thread-1',
    snippet: {
      videoId: 'video-1',
      topLevelComment: {
        id: 'comment-1',
        snippet: {
          videoId: 'video-1',
          textOriginal: 'This track got me through the week, thank you.',
          authorDisplayName: '@superfan',
          authorChannelId: { value: 'UCfan-1' },
          likeCount: 12,
          publishedAt: '2026-09-30T14:00:00.000Z',
        },
      },
    },
    ...overrides,
  };
}

function makeFetcher(
  threadsByStatus: Record<string, readonly unknown[]>,
  videos: readonly unknown[] = []
) {
  return vi.fn(async (url: URL) => {
    if (url.pathname.endsWith('/commentThreads')) {
      const status = url.searchParams.get('moderationStatus') ?? 'published';
      return jsonResponse({ items: threadsByStatus[status] ?? [] });
    }
    if (url.pathname.endsWith('/videos')) {
      return jsonResponse({ items: videos });
    }
    throw new Error(`Unexpected fetch: ${url.pathname}`);
  });
}

describe('listYouTubeInboundComments', () => {
  it('queries every moderation bucket for the owned channel', async () => {
    const fetcher = makeFetcher({ published: [thread()] });
    await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });

    const statuses = fetcher.mock.calls
      .map(([url]) => (url as URL).searchParams.get('moderationStatus'))
      .filter(Boolean);
    expect(statuses).toEqual(['published', 'heldForReview', 'likelySpam']);
    for (const [url] of fetcher.mock.calls) {
      const parsed = url as URL;
      if (!parsed.pathname.endsWith('/commentThreads')) continue;
      expect(parsed.searchParams.get('allThreadsRelatedToChannelId')).toBe(
        CHANNEL_ID
      );
    }
  });

  it('normalizes provenance and flags creator replies', async () => {
    const fetcher = makeFetcher({
      published: [
        thread({
          replies: {
            comments: [
              {
                snippet: {
                  authorChannelId: { value: CHANNEL_ID },
                  textOriginal: 'appreciate you',
                },
              },
            ],
          },
        }),
      ],
    });
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });

    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      threadId: 'thread-1',
      commentId: 'comment-1',
      videoId: 'video-1',
      authorChannelId: 'UCfan-1',
      authorLabel: '@superfan',
      likeCount: 12,
      publishedAt: '2026-09-30T14:00:00.000Z',
      moderationStatus: 'published',
      creatorReplied: true,
    });
  });

  it('dedupes threads that appear in multiple moderation buckets', async () => {
    const fetcher = makeFetcher({
      published: [thread()],
      heldForReview: [thread()],
    });
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].moderationStatus).toBe('published');
  });

  it('keeps held and likely-spam comments tagged for burial', async () => {
    const fetcher = makeFetcher({
      heldForReview: [thread({ id: 'held-1' })],
      likelySpam: [thread({ id: 'spam-1' })],
    });
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });
    expect(comments.map(c => [c.threadId, c.moderationStatus])).toEqual([
      ['held-1', 'heldForReview'],
      ['spam-1', 'likelySpam'],
    ]);
  });

  it('enriches comments with video titles', async () => {
    const fetcher = makeFetcher({ published: [thread()] }, [
      { id: 'video-1', snippet: { title: 'Midnight Drive (Live)' } },
    ]);
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });
    expect(comments[0].videoTitle).toBe('Midnight Drive (Live)');
  });

  it('follows pagination within a moderation bucket', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/commentThreads')) {
        if (!url.searchParams.get('pageToken')) {
          return jsonResponse({
            items: [thread()],
            nextPageToken: 'page-2',
          });
        }
        return jsonResponse({ items: [thread({ id: 'thread-2' })] });
      }
      return jsonResponse({ items: [] });
    });
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
      maxPages: 2,
    });
    expect(comments.map(c => c.threadId)).toEqual(['thread-1', 'thread-2']);
  });

  it('drops malformed threads without ids or text', async () => {
    const fetcher = makeFetcher({
      published: [
        thread({ id: undefined }),
        thread({
          id: 'empty-1',
          snippet: {
            videoId: 'video-1',
            topLevelComment: {
              id: 'comment-2',
              snippet: { videoId: 'video-1', textOriginal: '   ' },
            },
          },
        }),
      ],
    });
    const comments = await listYouTubeInboundComments({
      accessToken: 'token',
      channelId: CHANNEL_ID,
      fetcher: fetcher as never,
    });
    expect(comments).toEqual([]);
  });

  it('surfaces provider errors with the API reason', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            status: 'PERMISSION_DENIED',
            errors: [{ reason: 'forbidden' }],
          },
        },
        403
      )
    );
    await expect(
      listYouTubeInboundComments({
        accessToken: 'token',
        channelId: CHANNEL_ID,
        fetcher: fetcher as never,
      })
    ).rejects.toMatchObject({
      name: 'YouTubeProviderError',
      reason: 'forbidden',
    } satisfies Partial<YouTubeProviderError>);
  });
});
