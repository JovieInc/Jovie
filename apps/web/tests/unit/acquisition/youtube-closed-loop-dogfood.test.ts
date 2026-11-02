import { describe, expect, it, vi } from 'vitest';
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
  it('never treats a write-scoped Connect grant as approval to update a live video', async () => {
    let updateCalls = 0;
    const writer: YouTubeSnippetWriter = {
      getVideo: async videoId => video(videoId),
      updateVideo: async () => {
        updateCalls += 1;
        throw new Error('Live write attempted without approval');
      },
    };
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        reader: writer,
        auth,
        now: NOW,
      },
    });

    expect(updateCalls).toBe(0);
    expect(receipt.guardrails.videosUpdateCalls).toBe(0);
    expect(receipt.apply.linksInserted).toBe(0);
    expect(
      receipt.apply.results.every(result => result.applied === false)
    ).toBe(true);
    expect(receipt.outcome).toBe('blocked');
  });

  it('inspects exact link proposals without applying or claiming completed optimization', async () => {
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
        reader: writer,
        auth,
        now: NOW,
      },
    });

    expect(receipt.schema).toBe(YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA);
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.stages.map(item => `${item.stage}:${item.status}`)).toEqual([
      'paste_channel:pass',
      'free_thumbnails:pass',
      'connect_apply:blocked',
      'receipt:pass',
    ]);
    expect(receipt.thumbnails.beforeAfterPairs).toBe(3);
    expect(receipt.apply.linksInserted).toBe(0);
    expect(receipt.apply.linksAlreadyVerified).toBe(1);
    expect(calls.updates).toBe(0);
    expect(receipt.apply.results).toEqual([
      expect.objectContaining({
        videoId: 'v1',
        applied: false,
        verified: false,
        action: 'insert',
        plan: expect.objectContaining({
          currentDescription: 'New track out now.',
          proposedDescription: `New track out now.\n\nListen: ${EXPECTED_URL}`,
        }),
      }),
      expect.objectContaining({
        videoId: 'v2',
        applied: false,
        verified: true,
        action: 'none',
        error: null,
      }),
      expect.objectContaining({
        videoId: 'v3',
        applied: false,
        verified: false,
        action: 'insert',
      }),
    ]);
    expect(JSON.stringify(receipt)).not.toContain('"approved":');
    expect(receipt.guardrails).toEqual({
      officialApiOnly: true,
      thumbnailsSetCalled: false,
      videosUpdateCalls: 0,
      adsArmed: false,
      sendRemainsHuman: true,
    });
    expect(receipt.qualification?.qualified).toBe(true);
    expect(receipt.preflightReadiness?.passed).toBe(true);
  });

  it('never passes the apply stage when every description is already correct', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        reader: { getVideo: async id => video(id, EXPECTED_URL) },
        auth,
        now: NOW,
      },
    });
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toBe('connect_apply');
    expect(receipt.apply.linksAlreadyVerified).toBe(3);
    expect(receipt.apply.linksInserted).toBe(0);
    expect(
      receipt.apply.results.every(row => row.verified && !row.applied)
    ).toBe(true);
  });

  it('retains partial inspection results when one provider read throws and another video is unavailable', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        reader: {
          getVideo: async id => {
            if (id === 'v1') throw new Error('Private provider details');
            return id === 'v2' ? null : video(id);
          },
        },
        auth,
        now: NOW,
      },
    });
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.apply.results.map(row => row.error)).toEqual([
      'provider-read-failed',
      'video-unavailable',
      null,
    ]);
    expect(receipt.apply.results[2].plan?.action).toBe('insert');
    expect(receipt.apply.results.slice(0, 2).every(row => !row.plan)).toBe(
      true
    );
    expect(receipt.guardrails.videosUpdateCalls).toBe(0);
    expect(JSON.stringify(receipt)).not.toContain('Private provider details');
  });

  it.each(['wrong-video', 'wrong-channel', 'missing-channel'] as const)(
    'does not inspect a %s provider result',
    async mismatch => {
      const receipt = await runYoutubeClosedLoopDogfood({
        channelInput: '@timwhitemusic',
        expectedUrl: EXPECTED_URL,
        deps: {
          pasteChannelPreview: async () => preview(),
          reader: {
            getVideo: async id => ({
              ...video(mismatch === 'wrong-video' ? 'different' : id),
              snippet: {
                ...video(id).snippet,
                channelId:
                  mismatch === 'wrong-channel'
                    ? 'UCother'
                    : mismatch === 'missing-channel'
                      ? undefined
                      : CHANNEL.id,
              },
            }),
          },
          auth,
          now: NOW,
        },
      });
      expect(receipt.outcome).toBe('blocked');
      expect(
        receipt.apply.results.every(
          row => row.error === 'identity-mismatch' && !row.plan && !row.applied
        )
      ).toBe(true);
    }
  );

  it.each([
    { channelId: '', videoId: 'v1' },
    { channelId: CHANNEL.id, videoId: '' },
    { channelId: CHANNEL.id, videoId: 'invalid/id' },
  ])(
    'blocks invalid targets before provider access: %j',
    async ({ channelId, videoId }) => {
      const getVideo = vi.fn();
      const receipt = await runYoutubeClosedLoopDogfood({
        channelInput: '@timwhitemusic',
        expectedUrl: EXPECTED_URL,
        deps: {
          pasteChannelPreview: async () =>
            preview({
              channel: { ...CHANNEL, id: channelId },
              items: [{ ...preview().items[0], videoId }],
            }),
          reader: { getVideo },
          auth,
          now: NOW,
        },
      });
      expect(getVideo).not.toHaveBeenCalled();
      expect(receipt.apply.results[0]).toMatchObject({
        error: 'invalid-target',
        applied: false,
        verified: false,
      });
      expect(receipt.outcome).toBe('blocked');
    }
  );

  it('distinguishes stale, unsafe, and unresolved link plans without writes', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: {
        pasteChannelPreview: async () => preview(),
        reader: {
          getVideo: async id =>
            video(
              id,
              id === 'v1'
                ? 'Listen: https://jov.ie/old'
                : id === 'v2'
                  ? 'x'.repeat(5000)
                  : 'https://jov.ie/app'
            ),
        },
        auth,
        now: NOW,
      },
    });
    expect(receipt.apply.results.map(row => [row.action, row.error])).toEqual([
      ['replace', null],
      ['none', 'description-too-long'],
      ['none', 'inspection-unresolved'],
    ]);
    expect(receipt.guardrails.videosUpdateCalls).toBe(0);
    expect(receipt.outcome).toBe('blocked');
  });

  it.each(['missing', 'revoked'] as const)(
    'does not read with %s auth even if a reader exists',
    async state => {
      const getVideo = vi.fn();
      const receipt = await runYoutubeClosedLoopDogfood({
        channelInput: '@timwhitemusic',
        expectedUrl: EXPECTED_URL,
        deps: {
          pasteChannelPreview: async () => preview(),
          reader: { getVideo },
          auth: { state },
          now: NOW,
        },
      });
      expect(getVideo).not.toHaveBeenCalled();
      expect(receipt.apply.authState).toBe(state);
      expect(receipt.apply.videosEvaluated).toBe(0);
      expect(receipt.outcome).toBe('blocked');
    }
  );

  it('records no evaluated targets when read access is absent', async () => {
    const receipt = await runYoutubeClosedLoopDogfood({
      channelInput: '@timwhitemusic',
      expectedUrl: EXPECTED_URL,
      deps: { pasteChannelPreview: async () => preview(), now: NOW },
    });
    expect(receipt.apply.videosEvaluated).toBe(0);
    expect(receipt.apply.authState).toBe('missing');
    expect(receipt.outcome).toBe('blocked');
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
