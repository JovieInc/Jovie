import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockCheckAdminCreatorIngestRateLimit,
  mockCheckExistingProfile,
  mockCreateRateLimitHeaders,
  mockDetectFullExtractionPlatform,
  mockFetchFullExtractionProfile,
  mockGetCurrentUserEntitlements,
  mockHandleNewProfileIngest,
  mockHandleReingestProfile,
  mockIngestSocialPlatformUrl,
  mockLoggerError,
  mockMarkReingestFailure,
  mockNormalizeUrl,
  mockParseJsonBody,
  mockResolveFullExtractionContext,
  mockResolveHostedAvatarUrl,
  mockCreatorIngestSchemaSafeParse,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockCheckAdminCreatorIngestRateLimit: vi.fn(),
  mockCheckExistingProfile: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
  mockDetectFullExtractionPlatform: vi.fn(),
  mockFetchFullExtractionProfile: vi.fn(),
  mockGetCurrentUserEntitlements: vi.fn(),
  mockHandleNewProfileIngest: vi.fn(),
  mockHandleReingestProfile: vi.fn(),
  mockIngestSocialPlatformUrl: vi.fn(),
  mockLoggerError: vi.fn(),
  mockMarkReingestFailure: vi.fn(),
  mockNormalizeUrl: vi.fn(),
  mockParseJsonBody: vi.fn(),
  mockResolveFullExtractionContext: vi.fn(),
  mockResolveHostedAvatarUrl: vi.fn(),
  mockCreatorIngestSchemaSafeParse: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/ingestion/flows/avatar-hosting', () => ({
  resolveHostedAvatarUrl: mockResolveHostedAvatarUrl,
}));

vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({
  detectFullExtractionPlatform: mockDetectFullExtractionPlatform,
  fetchFullExtractionProfile: mockFetchFullExtractionProfile,
  resolveFullExtractionContext: mockResolveFullExtractionContext,
}));

vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  checkExistingProfile: mockCheckExistingProfile,
  markReingestFailure: mockMarkReingestFailure,
}));

vi.mock('@/lib/ingestion/flows/reingest-flow', () => ({
  handleNewProfileIngest: mockHandleNewProfileIngest,
  handleReingestProfile: mockHandleReingestProfile,
}));

vi.mock('@/lib/ingestion/flows/social-platform-ingest', () => ({
  ingestSocialPlatformUrl: mockIngestSocialPlatformUrl,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAdminCreatorIngestRateLimit: mockCheckAdminCreatorIngestRateLimit,
  createRateLimitHeaders: mockCreateRateLimitHeaders,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: mockNormalizeUrl,
}));

vi.mock('@/lib/validation/schemas', () => ({
  creatorIngestSchema: {
    safeParse: mockCreatorIngestSchemaSafeParse,
  },
}));

describe('POST /api/admin/creator-ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'admin_123',
      email: 'admin@example.com',
      isAuthenticated: true,
      isAdmin: true,
    });
    mockCheckAdminCreatorIngestRateLimit.mockResolvedValue({
      success: true,
      reset: new Date(Date.now() + 60_000),
    });
    mockCreateRateLimitHeaders.mockReturnValue({
      'x-ratelimit-limit': '10',
    });
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: { url: 'https://linktr.ee/test-artist' },
    });
    mockCreatorIngestSchemaSafeParse.mockReturnValue({
      success: true,
      data: { url: 'https://linktr.ee/test-artist' },
    });
    mockNormalizeUrl.mockImplementation((url: string) => url.trim());
    mockDetectFullExtractionPlatform.mockReturnValue({
      isLinktree: true,
      isLaylo: false,
      linktreeValidatedUrl: 'https://linktr.ee/test-artist',
    });
    mockResolveFullExtractionContext.mockReturnValue({
      ok: true,
      validatedUrl: 'https://linktr.ee/test-artist',
      handle: 'test-artist',
    });
    mockCheckExistingProfile.mockResolvedValue({
      existing: null,
      finalHandle: 'test-artist',
      isReingest: false,
    });
    mockFetchFullExtractionProfile.mockResolvedValue({
      displayName: 'Test Artist',
      avatarUrl: 'https://images.test/avatar.png',
      links: [],
    });
    mockResolveHostedAvatarUrl.mockResolvedValue(
      'https://blob.test/avatar.avif'
    );
    mockHandleNewProfileIngest.mockResolvedValue(
      NextResponse.json({
        ok: true,
        profile: { id: 'profile_123', username: 'test-artist' },
      })
    );
    mockHandleReingestProfile.mockResolvedValue(
      NextResponse.json({
        ok: true,
        reingested: true,
      })
    );
    mockIngestSocialPlatformUrl.mockResolvedValue(
      NextResponse.json({
        ok: true,
        platform: 'instagram',
      })
    );
    mockMarkReingestFailure.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when the user is not an admin', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValueOnce({
      userId: 'user_123',
      email: 'user@example.com',
      isAuthenticated: true,
      isAdmin: false,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 429 when the admin rate limit is exceeded', async () => {
    const reset = new Date(Date.now() + 2_500);
    mockCheckAdminCreatorIngestRateLimit.mockResolvedValueOnce({
      success: false,
      reason: 'Slow down',
      reset,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toEqual(
      expect.objectContaining({
        error: 'Rate limit exceeded',
        message: 'Slow down',
      })
    );
    expect(response.headers.get('x-ratelimit-limit')).toBe('10');
  });

  it('returns the parseJsonBody error response for malformed requests', async () => {
    mockParseJsonBody.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Malformed JSON' }, { status: 400 }),
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' });
  });

  it('returns 400 when the request body fails schema validation', async () => {
    mockCreatorIngestSchemaSafeParse.mockReturnValueOnce({
      success: false,
      error: {
        flatten: () => ({ fieldErrors: { url: ['Invalid profile URL'] } }),
      },
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: 'Invalid request body',
      })
    );
  });

  it('returns 409 when no unique username can be allocated', async () => {
    mockCheckExistingProfile.mockResolvedValueOnce({
      existing: null,
      finalHandle: null,
      isReingest: false,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to allocate unique username',
      details: 'All fallback username attempts exhausted.',
    });
  });

  it('returns 409 when the target profile is already claimed', async () => {
    mockCheckExistingProfile.mockResolvedValueOnce({
      existing: { id: 'profile_123', isClaimed: true },
      finalHandle: 'test-artist',
      isReingest: false,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile already claimed',
      details: 'Cannot overwrite a claimed profile.',
    });
  });

  it('returns 502 and marks failure when full extraction fetching fails', async () => {
    const fetchError = new Error('upstream failed');
    mockFetchFullExtractionProfile.mockRejectedValueOnce(fetchError);

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch profile',
      details: 'upstream failed',
    });
    expect(mockMarkReingestFailure).toHaveBeenCalledWith(
      expect.objectContaining({ finalHandle: 'test-artist' }),
      'upstream failed'
    );
  });

  it('routes reingests through the reingest flow', async () => {
    mockCheckExistingProfile.mockResolvedValueOnce({
      existing: { id: 'profile_123', isClaimed: false },
      finalHandle: 'test-artist',
      isReingest: true,
    });

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, reingested: true });
    expect(mockHandleReingestProfile).toHaveBeenCalled();
    expect(mockHandleNewProfileIngest).not.toHaveBeenCalled();
  });

  it('falls back to social-platform ingest for non-full-extraction URLs', async () => {
    mockDetectFullExtractionPlatform.mockReturnValueOnce({
      isLinktree: false,
      isLaylo: false,
      linktreeValidatedUrl: null,
    });
    mockCreatorIngestSchemaSafeParse.mockReturnValueOnce({
      success: true,
      data: { url: 'https://instagram.com/test-artist' },
    });
    mockParseJsonBody.mockResolvedValueOnce({
      ok: true,
      data: { url: 'https://instagram.com/test-artist' },
    });
    mockNormalizeUrl.mockReturnValueOnce('https://instagram.com/test-artist');

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, platform: 'instagram' });
    expect(mockIngestSocialPlatformUrl).toHaveBeenCalledWith(
      'https://instagram.com/test-artist'
    );
  });

  it('captures and classifies unexpected errors', async () => {
    const crash = new Error('unique constraint violated');
    mockParseJsonBody.mockRejectedValueOnce(crash);

    const { POST } = await import('@/app/api/admin/creator-ingest/route');
    const response = await POST(
      new NextRequest('http://localhost/api/admin/creator-ingest', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'A creator profile with that handle already exists',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Admin creator ingest failed',
      crash,
      expect.objectContaining({
        route: '/api/admin/creator-ingest',
        method: 'POST',
      })
    );
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
