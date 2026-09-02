import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@vercel/blob', () => ({ put: vi.fn() }));
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('@/lib/blob-config', () => ({
  getBlobCommandOptions: () => ({}),
  isBlobStorageConfigured: () => false,
}));
vi.mock('@/lib/flags/code-flags', () => ({
  isCodeFlagEnabled: vi.fn(() => false),
}));
vi.mock('@/lib/rate-limit', () => ({
  getRedisClient: () => null,
  youtubeThumbnailPreviewBurstLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewCooldownLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewVisitorLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewChannelLimiter: { limit: vi.fn() },
}));
vi.mock('@/lib/services/retouching/provider-gemini', () => ({
  isRetouchConfigured: () => false,
  runRetouchModel: vi.fn(),
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  isDatacenterAsn: (asn: number) => asn === 16509,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));

import {
  PreviewAbuseError,
  type PreviewAbuseGuards,
} from '@/lib/youtube-thumbnails/abuse';
import {
  buildRedoPrompt,
  buildThumbnailPreview,
  InvalidChannelError,
  redoCacheKey,
  type ThumbnailPreviewDeps,
} from '@/lib/youtube-thumbnails/preview-service';
import type { YouTubeRecentVideo } from '@/lib/youtube/resolve-channel';

const ok = (remaining = 2) => ({
  success: true,
  limit: 3,
  remaining,
  reset: new Date(Date.now() + 60_000),
});
const denied = () => ({
  success: false,
  limit: 3,
  remaining: 0,
  reset: new Date(Date.now() + 120_000),
});

const VIDEOS: readonly YouTubeRecentVideo[] = [
  { videoId: 'a1', title: 'One', thumbnailUrl: 'https://i/a1.jpg', publishedAt: null },
  { videoId: 'b2', title: 'Two', thumbnailUrl: 'https://i/b2.jpg', publishedAt: null },
  { videoId: 'c3', title: 'Three', thumbnailUrl: 'https://i/c3.jpg', publishedAt: null },
];

function makeGuards(
  overrides: Partial<PreviewAbuseGuards> = {}
): PreviewAbuseGuards {
  return {
    limitBurst: vi.fn().mockResolvedValue(ok()),
    limitCooldown: vi.fn().mockResolvedValue(ok()),
    limitVisitor: vi.fn().mockResolvedValue(ok(2)),
    limitChannel: vi.fn().mockResolvedValue(ok(1)),
    recordChannelForIp: vi.fn().mockResolvedValue(1),
    isDatacenter: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ThumbnailPreviewDeps> = {}) {
  const store = new Map<string, string>();
  const deps: ThumbnailPreviewDeps = {
    resolveChannel: vi.fn().mockResolvedValue({
      channelId: 'UC1',
      title: 'Tim',
      handle: 'tim',
      uploadsPlaylistId: 'UU1',
    }),
    listVideos: vi.fn().mockResolvedValue(VIDEOS),
    isGenerationEnabled: vi.fn().mockReturnValue(false),
    generateRedo: vi.fn(async (video: YouTubeRecentVideo) => `https://blob/${video.videoId}.jpg`),
    cache: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
    guards: makeGuards(),
    ...overrides,
  };
  return { deps, store };
}

const INPUT = {
  channelInput: '@tim',
  ip: '203.0.113.9',
  deviceId: 'device-1234',
  asn: undefined,
};

describe('buildThumbnailPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns preview_only with zero model calls and no counts when generation is off', async () => {
    const { deps } = makeDeps();

    const result = await buildThumbnailPreview(INPUT, deps);

    expect(result.mode).toBe('preview_only');
    expect(result.remaining).toBeNull();
    expect(result.items).toHaveLength(3);
    expect(result.items.every(item => item.afterUrl === null)).toBe(true);
    expect(result.items[0]?.beforeUrl).toBe('https://i/a1.jpg');
    expect(deps.generateRedo).not.toHaveBeenCalled();
    expect(deps.guards.limitVisitor).not.toHaveBeenCalled();
    expect(deps.guards.limitChannel).not.toHaveBeenCalled();
    expect(deps.guards.limitBurst).toHaveBeenCalledTimes(1);
    expect(deps.guards.recordChannelForIp).toHaveBeenCalledWith(INPUT.ip, 'UC1');
  });

  it('generates only missing redos, caches them, and reports the tighter remaining cap', async () => {
    const { deps, store } = makeDeps({
      isGenerationEnabled: vi.fn().mockReturnValue(true),
    });
    store.set(redoCacheKey('a1'), 'https://blob/cached-a1.jpg');

    const result = await buildThumbnailPreview(INPUT, deps);

    expect(result.mode).toBe('redo');
    expect(result.remaining).toBe(1);
    expect(deps.generateRedo).toHaveBeenCalledTimes(2);
    expect(result.items.map(item => item.afterUrl)).toEqual([
      'https://blob/cached-a1.jpg',
      'https://blob/b2.jpg',
      'https://blob/c3.jpg',
    ]);
    expect(store.get(redoCacheKey('b2'))).toBe('https://blob/b2.jpg');
    expect(deps.guards.limitCooldown).toHaveBeenCalledTimes(1);
  });

  it('serves a fully cached channel as redo with no model call and no count consumed', async () => {
    const { deps, store } = makeDeps({
      isGenerationEnabled: vi.fn().mockReturnValue(true),
    });
    for (const video of VIDEOS) {
      store.set(redoCacheKey(video.videoId), `https://blob/${video.videoId}.jpg`);
    }

    const result = await buildThumbnailPreview(INPUT, deps);

    expect(result.mode).toBe('redo');
    expect(result.remaining).toBeNull();
    expect(deps.generateRedo).not.toHaveBeenCalled();
    expect(deps.guards.limitVisitor).not.toHaveBeenCalled();
    expect(deps.guards.limitCooldown).not.toHaveBeenCalled();
  });

  it('rejects invalid input before any lookup', async () => {
    const { deps } = makeDeps();
    await expect(
      buildThumbnailPreview({ ...INPUT, channelInput: 'has spaces' }, deps)
    ).rejects.toMatchObject({ code: 'invalid_channel' });
    expect(deps.resolveChannel).not.toHaveBeenCalled();
  });

  it('rejects unknown channels and channels with no public videos', async () => {
    const unknown = makeDeps({ resolveChannel: vi.fn().mockResolvedValue(null) });
    await expect(buildThumbnailPreview(INPUT, unknown.deps)).rejects.toBeInstanceOf(
      InvalidChannelError
    );

    const empty = makeDeps({ listVideos: vi.fn().mockResolvedValue([]) });
    await expect(buildThumbnailPreview(INPUT, empty.deps)).rejects.toMatchObject(
      { code: 'no_videos' }
    );
  });

  it('hard-blocks datacenter ASNs before touching YouTube', async () => {
    const { deps } = makeDeps({
      guards: makeGuards({ isDatacenter: vi.fn().mockReturnValue(true) }),
    });
    await expect(
      buildThumbnailPreview({ ...INPUT, asn: 16509 }, deps)
    ).rejects.toMatchObject({ code: 'datacenter' });
    expect(deps.resolveChannel).not.toHaveBeenCalled();
  });

  it('blocks burst, channel spread, visitor cap and channel cap with the right codes', async () => {
    const burst = makeDeps({
      guards: makeGuards({ limitBurst: vi.fn().mockResolvedValue(denied()) }),
    });
    await expect(buildThumbnailPreview(INPUT, burst.deps)).rejects.toMatchObject({
      code: 'burst',
    });

    const spread = makeDeps({
      guards: makeGuards({ recordChannelForIp: vi.fn().mockResolvedValue(4) }),
    });
    await expect(buildThumbnailPreview(INPUT, spread.deps)).rejects.toMatchObject(
      { code: 'channel_spread' }
    );

    const visitor = makeDeps({
      isGenerationEnabled: vi.fn().mockReturnValue(true),
      guards: makeGuards({ limitVisitor: vi.fn().mockResolvedValue(denied()) }),
    });
    const visitorError = await buildThumbnailPreview(INPUT, visitor.deps).catch(
      error => error
    );
    expect(visitorError).toBeInstanceOf(PreviewAbuseError);
    expect(visitorError.code).toBe('visitor_limit');
    expect(visitorError.retryAfterSeconds).toBeGreaterThan(0);
    expect(visitor.deps.generateRedo).not.toHaveBeenCalled();

    const channel = makeDeps({
      isGenerationEnabled: vi.fn().mockReturnValue(true),
      guards: makeGuards({ limitChannel: vi.fn().mockResolvedValue(denied()) }),
    });
    await expect(buildThumbnailPreview(INPUT, channel.deps)).rejects.toMatchObject(
      { code: 'channel_limit' }
    );
  });

  it('keeps going when a single redo fails, leaving that item pending', async () => {
    const { deps } = makeDeps({
      isGenerationEnabled: vi.fn().mockReturnValue(true),
      generateRedo: vi
        .fn()
        .mockResolvedValueOnce('https://blob/a1.jpg')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('https://blob/c3.jpg'),
    });

    const result = await buildThumbnailPreview(INPUT, deps);

    expect(result.items.map(item => item.afterUrl)).toEqual([
      'https://blob/a1.jpg',
      null,
      'https://blob/c3.jpg',
    ]);
    expect(deps.cache.set).toHaveBeenCalledTimes(2);
  });
});

describe('buildRedoPrompt', () => {
  it('locks the identity guardrail into every prompt', () => {
    const prompt = buildRedoPrompt('My video');
    expect(prompt).toMatch(/do not generate, replace, retouch, restyle or alter any face or body/);
    expect(prompt).toMatch(/No logos, no watermarks/);
    expect(prompt).toContain('"My video"');
  });
});
