import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const redisGet = vi.fn();
const redisSet = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  getRedisClient: () => ({ get: redisGet, set: redisSet }),
}));

const putMock = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => putMock(...args),
}));

vi.mock('@/lib/blob-config', () => ({
  getBlobCommandOptions: () => ({ token: 'test-token' }),
  isBlobStorageConfigured: () => true,
}));

const runRetouchModelMock = vi.fn();
vi.mock('@/lib/services/retouching/provider-gemini', () => ({
  RETOUCH_MODEL_ID: 'google/gemini-2.5-flash-image',
  RetouchGatewayUnconfiguredError: class extends Error {
    readonly code = 'RETOUCH_GATEWAY_UNCONFIGURED' as const;
  },
  RetouchNoImageReturnedError: class extends Error {
    readonly code = 'RETOUCH_NO_IMAGE_RETURNED' as const;
    readonly modelText: string;
    constructor(modelText: string) {
      super('no image');
      this.modelText = modelText;
    }
  },
  runRetouchModel: (...args: unknown[]) => runRetouchModelMock(...args),
}));

vi.mock('@/lib/services/retouching/style', () => ({
  buildRetouchPrompt: () => 'prompt',
  getRetouchStyleVersion: () => 'a'.repeat(64),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  RetouchGatewayUnconfiguredError,
  RetouchNoImageReturnedError,
} from '@/lib/services/retouching/provider-gemini';
import {
  generateThumbnailRedo,
  getCachedThumbnailRedo,
} from '@/lib/youtube-thumbnails/generate';

describe('getCachedThumbnailRedo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the cached URL without any model call', async () => {
    redisGet.mockResolvedValue('https://blob.example/redo.jpg');
    await expect(getCachedThumbnailRedo('video-1')).resolves.toBe(
      'https://blob.example/redo.jpg'
    );
    expect(runRetouchModelMock).not.toHaveBeenCalled();
  });

  it('ignores malformed cache values', async () => {
    redisGet.mockResolvedValue('not-a-url');
    await expect(getCachedThumbnailRedo('video-1')).resolves.toBeNull();
  });
});

describe('generateThumbnailRedo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisSet.mockResolvedValue('OK');
  });

  it('uploads to a deterministic video+style path and caches the result', async () => {
    runRetouchModelMock.mockResolvedValue({
      image: Buffer.from('png-bytes'),
      mediaType: 'image/png',
      model: 'google/gemini-2.5-flash-image',
      tokenUsage: { totalTokens: 100 },
    });
    putMock.mockResolvedValue({ url: 'https://blob.example/redo.png' });

    const result = await generateThumbnailRedo({
      videoId: 'video-1',
      beforeUrl: 'https://i.ytimg.com/vi/video-1/maxresdefault.jpg',
    });

    expect(result).toEqual({
      ok: true,
      afterUrl: 'https://blob.example/redo.png',
      cached: false,
      model: 'google/gemini-2.5-flash-image',
    });
    expect(putMock).toHaveBeenCalledWith(
      `youtube-thumbnails/redo/video-1/${'a'.repeat(16)}.png`,
      expect.any(Buffer),
      expect.objectContaining({ addRandomSuffix: false })
    );
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringContaining('video-1'),
      'https://blob.example/redo.png',
      expect.objectContaining({ ex: expect.any(Number) })
    );
  });

  it('maps gateway misconfiguration to provider_unavailable', async () => {
    runRetouchModelMock.mockRejectedValue(
      new RetouchGatewayUnconfiguredError()
    );
    const result = await generateThumbnailRedo({
      videoId: 'video-1',
      beforeUrl: 'https://i.ytimg.com/vi/video-1/maxresdefault.jpg',
    });
    expect(result).toEqual({ ok: false, code: 'provider_unavailable' });
    expect(putMock).not.toHaveBeenCalled();
  });

  it('maps an identity-guardrail refusal to guardrail_refusal', async () => {
    runRetouchModelMock.mockRejectedValue(
      new RetouchNoImageReturnedError('refused')
    );
    const result = await generateThumbnailRedo({
      videoId: 'video-1',
      beforeUrl: 'https://i.ytimg.com/vi/video-1/maxresdefault.jpg',
    });
    expect(result).toEqual({ ok: false, code: 'guardrail_refusal' });
  });

  it('maps unexpected failures to generation_failed without throwing', async () => {
    runRetouchModelMock.mockRejectedValue(new Error('boom'));
    const result = await generateThumbnailRedo({
      videoId: 'video-1',
      beforeUrl: 'https://i.ytimg.com/vi/video-1/maxresdefault.jpg',
    });
    expect(result).toEqual({ ok: false, code: 'generation_failed' });
  });
});
