import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildThumbnailPreview = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/youtube-thumbnails/preview-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/youtube-thumbnails/preview-service')
  >('@/lib/youtube-thumbnails/preview-service');
  return {
    InvalidChannelError: actual.InvalidChannelError,
    buildThumbnailPreview: mockBuildThumbnailPreview,
  };
});
vi.mock('@/lib/youtube-thumbnails/abuse', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/youtube-thumbnails/abuse')
  >('@/lib/youtube-thumbnails/abuse');
  return { PreviewAbuseError: actual.PreviewAbuseError };
});
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '198.51.100.7',
  getRedisClient: () => null,
  youtubeThumbnailPreviewBurstLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewCooldownLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewVisitorLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewChannelLimiter: { limit: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@vercel/blob', () => ({ put: vi.fn() }));
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('@/lib/blob-config', () => ({
  getBlobCommandOptions: () => ({}),
  isBlobStorageConfigured: () => false,
}));
vi.mock('@/lib/services/retouching/provider-gemini', () => ({
  isRetouchConfigured: () => false,
  runRetouchModel: vi.fn(),
}));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));

import { YouTubeDataApiUnavailableError } from '@/lib/youtube/resolve-channel';
import { PreviewAbuseError } from '@/lib/youtube-thumbnails/abuse';
import { InvalidChannelError } from '@/lib/youtube-thumbnails/preview-service';

function requestWith(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/youtube-thumbnails/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/youtube-thumbnails/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the preview and forwards ip, device and asn to the service', async () => {
    mockBuildThumbnailPreview.mockResolvedValue({
      channel: { id: 'UC1', title: 'Tim', handle: 'tim' },
      mode: 'preview_only',
      remaining: null,
      items: [],
    });
    const { POST } = await import('@/app/api/youtube-thumbnails/preview/route');

    const response = await POST(
      requestWith(
        { channel: '@tim' },
        { 'x-jovie-device': 'abcd-1234-efgh', 'x-vercel-ip-asn': '7922' }
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      mode: 'preview_only',
    });
    expect(mockBuildThumbnailPreview).toHaveBeenCalledWith({
      channelInput: '@tim',
      ip: '198.51.100.7',
      deviceId: 'abcd-1234-efgh',
      asn: 7922,
    });
  });

  it('drops malformed device headers instead of trusting them', async () => {
    mockBuildThumbnailPreview.mockResolvedValue({
      channel: { id: 'UC1', title: 'Tim', handle: null },
      mode: 'preview_only',
      remaining: null,
      items: [],
    });
    const { POST } = await import('@/app/api/youtube-thumbnails/preview/route');

    await POST(
      requestWith({ channel: '@tim' }, { 'x-jovie-device': 'bad header!' })
    );

    expect(mockBuildThumbnailPreview).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: null })
    );
  });

  it('rejects empty, oversized and non-JSON bodies with 400', async () => {
    const { POST } = await import('@/app/api/youtube-thumbnails/preview/route');

    expect((await POST(requestWith({ channel: '' }))).status).toBe(400);
    expect((await POST(requestWith({ channel: 'x'.repeat(201) }))).status).toBe(
      400
    );
    expect((await POST(requestWith('not json'))).status).toBe(400);
    expect(mockBuildThumbnailPreview).not.toHaveBeenCalled();
  });

  it('maps service errors to codes and statuses', async () => {
    const { POST } = await import('@/app/api/youtube-thumbnails/preview/route');

    mockBuildThumbnailPreview.mockRejectedValueOnce(
      new InvalidChannelError('no_videos')
    );
    const noVideos = await POST(requestWith({ channel: '@tim' }));
    expect(noVideos.status).toBe(400);
    await expect(noVideos.json()).resolves.toMatchObject({ code: 'no_videos' });

    mockBuildThumbnailPreview.mockRejectedValueOnce(
      new PreviewAbuseError('visitor_limit', 90)
    );
    const limited = await POST(requestWith({ channel: '@tim' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('90');
    await expect(limited.json()).resolves.toMatchObject({
      code: 'visitor_limit',
    });

    mockBuildThumbnailPreview.mockRejectedValueOnce(
      new PreviewAbuseError('datacenter')
    );
    expect((await POST(requestWith({ channel: '@tim' }))).status).toBe(403);

    mockBuildThumbnailPreview.mockRejectedValueOnce(
      new YouTubeDataApiUnavailableError()
    );
    const unavailable = await POST(requestWith({ channel: '@tim' }));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('retry-after')).toBeTruthy();

    mockBuildThumbnailPreview.mockRejectedValueOnce(new Error('boom'));
    const failed = await POST(requestWith({ channel: '@tim' }));
    expect(failed.status).toBe(500);
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
  });
});
