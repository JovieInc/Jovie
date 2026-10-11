import { describe, expect, it, vi } from 'vitest';
import type { SocialReplyTarget } from './contract';
import { createYouTubeReplyAdapter } from './youtube';

const CHANNEL_ID = 'UCchannel-1';
const CHECKED_AT = '2026-09-02T12:00:00.000Z';

function makeTarget(
  overrides: Partial<SocialReplyTarget> = {}
): SocialReplyTarget {
  return {
    platform: 'youtube',
    sourceId: 'video-1',
    targetId: 'comment-1',
    draftedText: 'thank you so much for listening',
    sourceKind: 'owned-audience',
    sourceUrl: 'https://www.youtube.com/watch?v=video-1',
    baselineMetadata: {},
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function channelsBody(channelId = CHANNEL_ID, title = 'Artist Channel') {
  return {
    items: [
      {
        id: channelId,
        snippet: { title },
        contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
      },
    ],
  };
}

function videoBody(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: 'video-1',
        snippet: { channelId: CHANNEL_ID },
        status: { privacyStatus: 'public', ...overrides },
      },
    ],
  };
}

function parentCommentBody(videoId = 'video-1') {
  return {
    items: [
      {
        id: 'comment-1',
        snippet: {
          videoId,
          authorChannelId: { value: 'UCfan-1' },
          textOriginal: 'love this track',
        },
      },
    ],
  };
}

/**
 * Routes fetch calls by URL. `channels`/`videos`/`commentsById`/`replies`
 * handlers may each be a single body or a queue of bodies/Responses.
 */
function fetchRouter(handlers: {
  channels?: unknown[];
  videos?: unknown[];
  commentById?: unknown[];
  replies?: unknown[];
  insert?: (body: unknown) => Response | Promise<Response>;
}) {
  const queues = {
    channels: [...(handlers.channels ?? [channelsBody()])],
    videos: [...(handlers.videos ?? [videoBody()])],
    commentById: [...(handlers.commentById ?? [parentCommentBody()])],
    replies: [...(handlers.replies ?? [{ items: [] }])],
  };
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const take = (queue: unknown[]) =>
        queue.length > 1 ? queue.shift() : queue[0];
      const resolve = (value: unknown) =>
        value instanceof Response ? value : jsonResponse(value);
      if (url.pathname.endsWith('/channels'))
        return resolve(take(queues.channels));
      if (url.pathname.endsWith('/videos')) return resolve(take(queues.videos));
      if (url.pathname.endsWith('/comments')) {
        if (init?.method === 'POST') {
          expect(handlers.insert).toBeDefined();
          return handlers.insert!(JSON.parse(String(init.body)));
        }
        if (url.searchParams.has('parentId')) {
          return resolve(take(queues.replies));
        }
        return resolve(take(queues.commentById));
      }
      throw new Error(`Unexpected fetch ${url}`);
    }
  );
  return { fetcher, calls };
}

function adapterWith(fetcher: ReturnType<typeof fetchRouter>['fetcher']) {
  return createYouTubeReplyAdapter({
    accessToken: 'token-1',
    channelId: CHANNEL_ID,
    fetcher,
    now: () => new Date(CHECKED_AT),
  });
}

describe('createYouTubeReplyAdapter', () => {
  it('preflights a public owned video and detects no existing creator reply', async () => {
    const { fetcher, calls } = fetchRouter({});
    const result = await adapterWith(fetcher).preflight(makeTarget());

    expect(result).toMatchObject({
      isPublic: true,
      canReply: true,
      existingReplyCount: 0,
      alreadyReplied: false,
      baselineMetadata: {
        channelId: CHANNEL_ID,
        channelTitle: 'Artist Channel',
      },
    });
    // Identity + video + comment + replies, in that order.
    expect(calls.map(call => call.url.pathname)).toEqual([
      '/youtube/v3/channels',
      '/youtube/v3/videos',
      '/youtube/v3/comments',
      '/youtube/v3/comments',
    ]);
  });

  it('reuses the resolved channel identity under the bounded lease', async () => {
    const { fetcher, calls } = fetchRouter({});
    const adapter = adapterWith(fetcher);

    await adapter.preflight(makeTarget());
    await adapter.preflight(makeTarget({ targetId: 'comment-2' }));

    const identityCalls = calls.filter(call =>
      call.url.pathname.endsWith('/channels')
    );
    expect(identityCalls).toHaveLength(1);
  });

  it('marks non-public or foreign videos as not public', async () => {
    const { fetcher } = fetchRouter({
      videos: [
        {
          items: [
            {
              id: 'video-1',
              snippet: { channelId: 'UCother' },
              status: { privacyStatus: 'public' },
            },
          ],
        },
      ],
    });
    const result = await adapterWith(fetcher).preflight(makeTarget());
    expect(result.isPublic).toBe(false);
    expect(result.canReply).toBe(false);
  });

  it('marks comments-disabled targets as not replyable', async () => {
    const { fetcher } = fetchRouter({
      commentById: [
        jsonResponse(
          { error: { errors: [{ reason: 'commentsDisabled' }] } },
          403
        ),
      ],
    });
    const result = await adapterWith(fetcher).preflight(makeTarget());
    expect(result).toMatchObject({ isPublic: true, canReply: false });
  });

  it('detects an existing creator reply immediately before send', async () => {
    const { fetcher } = fetchRouter({
      replies: [
        {
          items: [
            {
              id: 'reply-existing',
              snippet: {
                parentId: 'comment-1',
                authorChannelId: { value: CHANNEL_ID },
                textOriginal: 'already replied',
              },
            },
            {
              id: 'reply-fan',
              snippet: {
                parentId: 'comment-1',
                authorChannelId: { value: 'UCfan-2' },
                textOriginal: 'same',
              },
            },
          ],
        },
      ],
    });
    const result = await adapterWith(fetcher).preflight(makeTarget());
    expect(result).toMatchObject({
      canReply: true,
      alreadyReplied: true,
      existingReplyCount: 1,
    });
  });

  it('writes a reply bound to the exact parent comment and approved copy', async () => {
    const { fetcher, calls } = fetchRouter({
      insert: async () =>
        jsonResponse({
          id: 'reply-1',
          etag: 'etag-1',
          snippet: {
            parentId: 'comment-1',
            textOriginal: 'thank you so much for listening',
          },
        }),
    });
    const adapter = adapterWith(fetcher);
    const result = await adapter.writeReply(makeTarget());

    expect(result).toEqual({
      status: 'written',
      providerReplyId: 'reply-1',
      providerMetadata: { etag: 'etag-1' },
    });
    const insert = calls.find(call => call.init?.method === 'POST');
    expect(JSON.parse(String(insert?.init?.body))).toEqual({
      snippet: {
        parentId: 'comment-1',
        textOriginal: 'thank you so much for listening',
      },
    });
  });

  it('reports an ambiguous write when the provider echoes a different destination', async () => {
    const { fetcher } = fetchRouter({
      insert: async () =>
        jsonResponse({
          id: 'reply-1',
          snippet: {
            parentId: 'comment-other',
            textOriginal: 'thank you so much for listening',
          },
        }),
    });
    const result = await adapterWith(fetcher).writeReply(makeTarget());
    expect(result.status).toBe('ambiguous');
  });

  it('reports an ambiguous write when no comment ID is returned', async () => {
    const { fetcher } = fetchRouter({
      insert: async () => jsonResponse({ snippet: {} }),
    });
    const result = await adapterWith(fetcher).writeReply(makeTarget());
    expect(result.status).toBe('ambiguous');
  });

  it('refuses writes when the authorized account no longer owns the channel', async () => {
    const { fetcher } = fetchRouter({ channels: [channelsBody('UCother')] });
    const adapter = adapterWith(fetcher);
    await expect(adapter.writeReply(makeTarget())).rejects.toMatchObject({
      name: 'YouTubeProviderError',
      reason: 'channelMismatch',
    });
  });

  it('verifies the exact reply via remote readback', async () => {
    const target = makeTarget();
    const { fetcher } = fetchRouter({
      commentById: [
        {
          items: [
            {
              id: 'reply-1',
              etag: 'etag-2',
              snippet: {
                parentId: 'comment-1',
                authorChannelId: { value: CHANNEL_ID },
                textOriginal: target.draftedText,
              },
            },
          ],
        },
      ],
    });
    const adapter = adapterWith(fetcher);
    const result = await adapter.verifyReply(target, {
      status: 'written',
      providerReplyId: 'reply-1',
      providerMetadata: {},
    });
    expect(result).toMatchObject({
      status: 'verified',
      providerReplyId: 'reply-1',
      verifiedText: target.draftedText,
      providerMetadata: { etag: 'etag-2' },
    });
  });

  it('fails verification on not-found and author/text mismatch', async () => {
    const target = makeTarget();
    const notFound = fetchRouter({ commentById: [{ items: [] }] });
    expect(
      await adapterWith(notFound.fetcher).verifyReply(target, {
        status: 'written',
        providerReplyId: 'reply-1',
        providerMetadata: {},
      })
    ).toMatchObject({ status: 'not-found' });

    const mismatch = fetchRouter({
      commentById: [
        {
          items: [
            {
              id: 'reply-1',
              snippet: {
                parentId: 'comment-1',
                authorChannelId: { value: 'UCimposter' },
                textOriginal: target.draftedText,
              },
            },
          ],
        },
      ],
    });
    expect(
      await adapterWith(mismatch.fetcher).verifyReply(target, {
        status: 'written',
        providerReplyId: 'reply-1',
        providerMetadata: {},
      })
    ).toMatchObject({ status: 'mismatch' });
  });
});
