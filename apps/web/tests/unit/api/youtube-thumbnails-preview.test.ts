import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const isCodeFlagEnabledMock = vi.fn();
vi.mock('@/lib/flags/code-flags', () => ({
  isCodeFlagEnabled: (...args: unknown[]) => isCodeFlagEnabledMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '203.0.113.9',
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  extractAsnFromRequest: () => undefined,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const resolveYouTubeChannelMock = vi.fn();
const listRecentPublicVideosMock = vi.fn();
vi.mock('@/lib/youtube/resolve-channel', () => ({
  parseYouTubeChannelInput: (raw: string) => ({ kind: 'handle', value: raw }),
  resolveYouTubeChannel: (...args: unknown[]) =>
    resolveYouTubeChannelMock(...args),
  listRecentPublicVideos: (...args: unknown[]) =>
    listRecentPublicVideosMock(...args),
  YouTubeDataApiUnavailableError: class extends Error {
    readonly code = 'youtube_data_api_unavailable' as const;
  },
}));

const assertRequestAdmittedMock = vi.fn();
const assertChannelSpreadMock = vi.fn();
const assertGenerationCooldownMock = vi.fn();
const consumeGenerationAllowanceMock = vi.fn();
vi.mock('@/lib/youtube-thumbnails/abuse', () => {
  class PreviewAbuseError extends Error {
    readonly code: string;
    readonly retryAfterSeconds: number | null;
    constructor(code: string, retryAfterSeconds: number | null = null) {
      super(`Thumbnail preview blocked: ${code}`);
      this.name = 'PreviewAbuseError';
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
  return {
    PreviewAbuseError,
    assertRequestAdmitted: (...args: unknown[]) =>
      assertRequestAdmittedMock(...args),
    assertChannelSpread: (...args: unknown[]) =>
      assertChannelSpreadMock(...args),
    assertGenerationCooldown: (...args: unknown[]) =>
      assertGenerationCooldownMock(...args),
    consumeGenerationAllowance: (...args: unknown[]) =>
      consumeGenerationAllowanceMock(...args),
    buildThumbnailVisitorKey: () => 'visitor-key',
    parseThumbnailDeviceId: (raw: string | null) => raw,
  };
});

const getCachedThumbnailRedoMock = vi.fn();
const generateThumbnailRedoMock = vi.fn();
vi.mock('@/lib/youtube-thumbnails/generate', () => ({
  getCachedThumbnailRedo: (...args: unknown[]) =>
    getCachedThumbnailRedoMock(...args),
  generateThumbnailRedo: (...args: unknown[]) =>
    generateThumbnailRedoMock(...args),
}));

import { POST } from '@/app/api/youtube-thumbnails/preview/route';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { PreviewAbuseError } from '@/lib/youtube-thumbnails/abuse';

const CHANNEL = {
  channelId: 'UCchannel',
  title: 'Test Channel',
  handle: '@test',
  uploadsPlaylistId: 'UUchannel',
};

const VIDEOS = [
  {
    videoId: 'v1',
    title: 'One',
    thumbnailUrl: 'https://i.ytimg.com/vi/v1/maxresdefault.jpg',
  },
  {
    videoId: 'v2',
    title: 'Two',
    thumbnailUrl: 'https://i.ytimg.com/vi/v2/maxresdefault.jpg',
  },
  {
    videoId: 'v3',
    title: 'Three',
    thumbnailUrl: 'https://i.ytimg.com/vi/v3/maxresdefault.jpg',
  },
];

function request(channel = '@test', device: string | null = 'device-abc-123') {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (device) headers['x-jovie-device'] = device;
  return new Request('https://jov.ie/api/youtube-thumbnails/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ channel }),
  });
}

describe('POST /api/youtube-thumbnails/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveYouTubeChannelMock.mockResolvedValue(CHANNEL);
    listRecentPublicVideosMock.mockResolvedValue(VIDEOS);
    assertRequestAdmittedMock.mockResolvedValue(undefined);
    assertChannelSpreadMock.mockResolvedValue(undefined);
    assertGenerationCooldownMock.mockResolvedValue(undefined);
    consumeGenerationAllowanceMock.mockResolvedValue({
      success: true,
      limit: 3,
      remaining: 2,
      reset: new Date(Date.now() + 60_000),
    });
    getCachedThumbnailRedoMock.mockResolvedValue(null);
    generateThumbnailRedoMock.mockResolvedValue({
      ok: true,
      afterUrl: 'https://blob.example/redo.jpg',
      cached: false,
      model: 'google/gemini-2.5-flash-image',
    });
  });

  it('stays preview_only with no model call when the generate flag is off', async () => {
    isCodeFlagEnabledMock.mockReturnValue(false);
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('preview_only');
    expect(body.items).toHaveLength(3);
    expect(
      body.items.every((item: { afterUrl: null }) => item.afterUrl === null)
    ).toBe(true);
    expect(generateThumbnailRedoMock).not.toHaveBeenCalled();
    expect(consumeGenerationAllowanceMock).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(
      'youtube_thumbnails_previewed',
      expect.objectContaining({
        experimentId: 'youtube-closed-loop',
        variantIdentity: 'youtube-thumbnails:paste-channel:v1',
        parentVariantIdentity: 'youtube-closed-loop:paste-channel:v1',
        channelId: CHANNEL.channelId,
        contentVariant: 'paste-channel',
      })
    );
  });

  it('generates three before/after redos when the flag is on', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('before_after');
    expect(generateThumbnailRedoMock).toHaveBeenCalledTimes(3);
    expect(consumeGenerationAllowanceMock).toHaveBeenCalledTimes(3);
    expect(
      body.items.every(
        (item: { afterUrl: string | null }) =>
          item.afterUrl === 'https://blob.example/redo.jpg'
      )
    ).toBe(true);
    expect(body.remaining).toBe(2);
  });

  it('serves cached redos with no new model call and no budget spend', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    getCachedThumbnailRedoMock.mockResolvedValue(
      'https://blob.example/cached.jpg'
    );
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generateThumbnailRedoMock).not.toHaveBeenCalled();
    expect(consumeGenerationAllowanceMock).not.toHaveBeenCalled();
    expect(assertGenerationCooldownMock).not.toHaveBeenCalled();
    expect(
      body.items.every(
        (item: { afterUrl: string | null }) =>
          item.afterUrl === 'https://blob.example/cached.jpg'
      )
    ).toBe(true);
  });

  it('invalid channel = no generation', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    resolveYouTubeChannelMock.mockResolvedValue(null);
    const response = await POST(request('not-a-real-channel'));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_channel');
    expect(generateThumbnailRedoMock).not.toHaveBeenCalled();
    expect(consumeGenerationAllowanceMock).not.toHaveBeenCalled();
  });

  it('visitor cap degrades to befores-only instead of failing the preview', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    consumeGenerationAllowanceMock.mockRejectedValue(
      new PreviewAbuseError('visitor_cap', 86_400)
    );
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe('before_after');
    expect(generateThumbnailRedoMock).not.toHaveBeenCalled();
    expect(
      body.items.every((item: { afterUrl: null }) => item.afterUrl === null)
    ).toBe(true);
  });

  it('cooldown degrades to befores-only', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    assertGenerationCooldownMock.mockRejectedValue(
      new PreviewAbuseError('cooldown', 42)
    );
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generateThumbnailRedoMock).not.toHaveBeenCalled();
    expect(
      body.items.every((item: { afterUrl: null }) => item.afterUrl === null)
    ).toBe(true);
  });

  it('hard-blocks bursts with 429 + Retry-After', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    assertRequestAdmittedMock.mockRejectedValue(
      new PreviewAbuseError('burst', 30)
    );
    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect((await response.json()).code).toBe('burst');
  });

  it('hard-blocks datacenter networks with 403', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    assertRequestAdmittedMock.mockRejectedValue(
      new PreviewAbuseError('datacenter')
    );
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('datacenter');
  });
});
