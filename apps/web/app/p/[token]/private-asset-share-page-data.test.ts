import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBuildPublicView, mockExtractClientIP, mockHeaders, mockLimit } =
  vi.hoisted(() => ({
    mockBuildPublicView: vi.fn(),
    mockExtractClientIP: vi.fn(),
    mockHeaders: vi.fn(),
    mockLimit: vi.fn(),
  }));

vi.mock('next/headers', () => ({ headers: mockHeaders }));

vi.mock('@/lib/library/asset-share-public.server', () => ({
  buildLibraryAssetSharePublicViewByToken: mockBuildPublicView,
}));

vi.mock('@/lib/rate-limit', () => ({
  libraryAssetShareAccessLimiter: { limit: mockLimit },
  allowIfRateLimitBackendDegraded: (result: {
    readonly success: boolean;
    readonly degraded?: boolean;
    readonly unavailable?: boolean;
  }) =>
    !result.success && (result.degraded === true || result.unavailable === true)
      ? { ...result, success: true }
      : result,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

import { loadPrivateAssetSharePageData } from './private-asset-share-page-data';

const view = {
  assetId: 'release-1',
  itemKind: 'release',
  title: 'Example release',
  artistName: 'Example artist',
  artistHandle: 'exampleartist',
  artworkUrl: null,
  previewUrl: null,
  smartLinkPath: '/exampleartist/example-release',
  visibility: 'private',
} as const;

describe('loadPrivateAssetSharePageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockExtractClientIP.mockReturnValue('203.0.113.8');
    mockLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60_000),
    });
    mockBuildPublicView.mockResolvedValue(view);
  });

  it('checks the request IP before loading the token-backed view', async () => {
    const result = await loadPrivateAssetSharePageData('share-token');

    expect(mockHeaders).toHaveBeenCalledOnce();
    expect(mockExtractClientIP).toHaveBeenCalledWith(expect.any(Headers));
    expect(mockLimit).toHaveBeenCalledWith('203.0.113.8');
    expect(mockLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mockBuildPublicView.mock.invocationCallOrder[0] ?? 0
    );
    expect(mockBuildPublicView).toHaveBeenCalledWith('share-token');
    expect(result).toEqual({ status: 'ready', view });
  });

  it('denies an exhausted IP without touching the database-backed loader', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    await expect(loadPrivateAssetSharePageData('share-token')).resolves.toEqual(
      { status: 'rate_limited' }
    );
    expect(mockBuildPublicView).not.toHaveBeenCalled();
  });

  it('keeps share links available when the durable limiter is degraded', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      unavailable: true,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    await expect(loadPrivateAssetSharePageData('share-token')).resolves.toEqual(
      { status: 'ready', view }
    );
    expect(mockBuildPublicView).toHaveBeenCalledOnce();
  });

  it('preserves the generic unavailable result for an admitted missing token', async () => {
    mockBuildPublicView.mockResolvedValue(null);

    await expect(
      loadPrivateAssetSharePageData('missing-token')
    ).resolves.toEqual({ status: 'not_found' });
  });
});
