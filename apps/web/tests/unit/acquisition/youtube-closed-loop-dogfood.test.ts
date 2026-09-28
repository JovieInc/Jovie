import { describe, expect, it } from 'vitest';
import {
  runYoutubeClosedLoopDogfood,
  YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA,
  type YoutubeDogfoodPastePreview,
} from '@/lib/acquisition/youtube-closed-loop-dogfood';
import type {
  YouTubeSnippetWriter,
  YouTubeVideoSnippetRecord,
} from '@/lib/youtube-library/link-apply';
import { YOUTUBE_LINK_WRITE_SCOPE } from '@/lib/youtube-library/link-apply';

const EXPECTED_URL = 'https://jov.ie/tim';
const NOW = new Date('2026-09-27T00:00:00Z');

const CHANNEL = {
  id: 'UCtimchannel000000000001',
  title: 'Tim White',
  handle: 'timwhitemusic',
};

function video(
  videoId: string,
  description = 'New track out now.'
): YouTubeVideoSnippetRecord {
  return {
    id: videoId,
    etag: `etag-${videoId}`,
    snippet: {
      title: `Video ${videoId}`,
      description,
      categoryId: '10',
      channelId: CHANNEL.id,
    },
  };
}

function memoryWriter(initial: readonly ReturnType<typeof video>[]) {
  const rows = new Map(initial.map(item => [item.id, item]));
  const calls = { updates: 0 };
  const writer: YouTubeSnippetWriter = {
    getVideo: async videoId => rows.get(videoId) ?? null,
    updateVideo: async input => {
      calls.updates += 1;
      const next = {
        id: input.videoId,
        etag: `etag-${input.videoId}-next`,
        snippet: input.snippet,
      };
      rows.set(input.videoId, next);
      return next;
    },
  };
  return { writer, calls };
}

function preview(
  overrides?: Partial<YoutubeDogfoodPastePreview>
): YoutubeDogfoodPastePreview {
  const daysAgo = (days: number) =>
    new Date(NOW.getTime() - days * 86_400_000).toISOString();
  return {
    channel: CHANNEL,
    mode: 'before_after',
    items: ['v1', 'v2', 'v3'].map(id => ({
      videoId: id,
      title: `Video ${id}`,
      beforeUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      afterUrl: `https://blob.jov.ie/redo/${id}.jpg`,
      publishedAt: daysAgo(10),
    })),
    ...overrides,
  };
}

const auth = {
  state: 'ok' as const,
  scopes: [YOUTUBE_LINK_WRITE_SCOPE],
};

describe('YouTube closed-loop dogfood (JOV-5883)', () => {
  it('emits a pass receipt across the golden path: paste → 3 before/after thumbs → Connect apply → Jovie link insert', async () => {
    const { writer, calls } = memoryWriter([
      video('v1'),
      video('v2', `Already linked.\nListen: ${EXPECTED_URL}`),
      video('v3'),
    ]);
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: 'youtube.com/@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        writer,
        auth,
        now: NOW,
      },
    });

    expect(receipt.schema).toBe(YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA);
    expect(receipt.outcome).toBe('pass');
    expect(receipt.stages.map(item => `${item.stage}:${item.status}`)).toEqual([
      'paste_channel:pass',
      'free_thumbnails:pass',
      'connect_apply:pass',
      'receipt:pass',
    ]);
    expect(receipt.thumbnails.beforeAfterPairs).toBe(3);
    expect(receipt.apply.linksInserted).toBe(2);
    expect(receipt.apply.linksAlreadyVerified).toBe(1);
    expect(calls.updates).toBe(2);
    expect(receipt.guardrails).toEqual({
      officialApiOnly: true,
      thumbnailsSetCalled: false,
      videosUpdateCalls: 2,
      adsArmed: false,
      sendRemainsHuman: true,
    });
    expect(receipt.qualification?.qualified).toBe(true);
    expect(receipt.preflightReadiness?.passed).toBe(true);
  });

  it('blocks (not fakes) the apply stage without a Connect grant', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        auth: { state: 'missing' },
        now: NOW,
      },
    });

    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toBe('connect_apply');
    expect(receipt.apply.authState).toBe('missing');
    expect(
      receipt.stages.find(item => item.stage === 'connect_apply')?.status
    ).toBe('blocked');
  });

  it('blocks when the preview cannot produce before/after pairs', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () =>
          preview({
            mode: 'preview_only',
            items: preview().items.map(item => ({ ...item, afterUrl: null })),
          }),
        auth: { state: 'missing' },
        now: NOW,
      },
    });

    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toBe('free_thumbnails');
    expect(receipt.preflightReadiness?.passed).toBe(false);
  });

  it('fails closed when the paste surface errors', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => {
          throw new Error(
            'preview route returned 429: Free preview limit reached'
          );
        },
        now: NOW,
      },
    });

    expect(receipt.outcome).toBe('fail');
    expect(receipt.blocker).toBe('paste_channel');
    expect(receipt.channel).toBeNull();
    expect(receipt.apply.authState).toBe('unattempted');
  });
});
