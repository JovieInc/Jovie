import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAcquirePlaylistGenerationLease,
  mockGetAppFlagValue,
  mockGeneratePlaylist,
  mockGetPlaylistEngineSettings,
  mockGetPlaylistSpotifyStatus,
  mockReleasePlaylistGenerationLease,
  mockVerifyCronRequest,
} = vi.hoisted(() => ({
  mockAcquirePlaylistGenerationLease: vi.fn(),
  mockGetAppFlagValue: vi.fn(),
  mockGeneratePlaylist: vi.fn(),
  mockGetPlaylistEngineSettings: vi.fn(),
  mockGetPlaylistSpotifyStatus: vi.fn(),
  mockReleasePlaylistGenerationLease: vi.fn(),
  mockVerifyCronRequest: vi.fn(),
}));

vi.mock('@/lib/admin/platform-connections', () => ({
  acquirePlaylistGenerationLease: mockAcquirePlaylistGenerationLease,
  getPlaylistEngineSettings: mockGetPlaylistEngineSettings,
  getPlaylistSpotifyStatus: mockGetPlaylistSpotifyStatus,
  releasePlaylistGenerationLease: mockReleasePlaylistGenerationLease,
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mockGetAppFlagValue,
}));

vi.mock('@/lib/playlists/pipeline', () => ({
  generatePlaylist: mockGeneratePlaylist,
}));

function request() {
  return new Request('http://localhost/api/cron/generate-playlist');
}

describe('GET /api/cron/generate-playlist', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockVerifyCronRequest.mockReturnValue(null);
    mockGetAppFlagValue.mockResolvedValue(true);
    mockGetPlaylistEngineSettings.mockResolvedValue({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: null,
      nextEligibleAt: null,
    });
    mockGetPlaylistSpotifyStatus.mockResolvedValue({
      healthy: true,
      source: 'database',
      error: null,
    });
    mockAcquirePlaylistGenerationLease.mockResolvedValue({
      claimed: true,
      claimedAt: new Date('2026-04-15T00:00:00.000Z'),
      leaseExpiresAt: new Date('2026-04-15T00:15:00.000Z'),
    });
    mockGeneratePlaylist.mockResolvedValue({
      success: true,
      playlistId: 'playlist_1',
      title: 'Test Playlist',
      trackCount: 24,
      durationMs: 100,
    });
  });

  it('returns cron auth failures directly', async () => {
    mockVerifyCronRequest.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it('skips when the engine is disabled', async () => {
    mockGetPlaylistEngineSettings.mockResolvedValueOnce({
      enabled: false,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: null,
      nextEligibleAt: null,
    });

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      skipped: true,
      reason: 'Playlist engine is disabled',
    });
    expect(mockGeneratePlaylist).not.toHaveBeenCalled();
  });

  it('skips when the next eligible time is in the future', async () => {
    mockGetPlaylistEngineSettings.mockResolvedValueOnce({
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: null,
      nextEligibleAt: new Date(Date.now() + 60_000),
    });

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      skipped: true,
      reason: 'Playlist engine is not eligible yet',
    });
    expect(mockGeneratePlaylist).not.toHaveBeenCalled();
  });

  it('skips when Spotify is unhealthy', async () => {
    mockGetPlaylistSpotifyStatus.mockResolvedValueOnce({
      healthy: false,
      source: 'missing',
      error: 'Playlist Spotify publisher is not configured.',
    });

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      skipped: true,
      reason: 'Playlist Spotify publisher is not configured.',
    });
    expect(mockGeneratePlaylist).not.toHaveBeenCalled();
  });

  it('skips when another worker already holds the generation lease', async () => {
    mockAcquirePlaylistGenerationLease.mockResolvedValueOnce({
      claimed: false,
      claimedAt: new Date('2026-04-15T00:00:00.000Z'),
      leaseExpiresAt: new Date('2026-04-15T00:15:00.000Z'),
    });

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      skipped: true,
      reason: 'Playlist generation is already in progress or not eligible',
    });
    expect(mockGeneratePlaylist).not.toHaveBeenCalled();
  });

  it('runs generation and updates eligibility on success', async () => {
    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      playlistId: 'playlist_1',
      title: 'Test Playlist',
      trackCount: 24,
    });
    expect(mockGeneratePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        skipComplianceCheck: true,
        recordCadenceOnSuccess: true,
      })
    );
    expect(mockReleasePlaylistGenerationLease).not.toHaveBeenCalled();
  });

  it('releases the lease when generation fails', async () => {
    mockGeneratePlaylist.mockResolvedValueOnce({
      success: false,
      error: 'Generation failed',
      durationMs: 100,
    });

    const { GET } = await import('@/app/api/cron/generate-playlist/route');
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: 'Generation failed',
    });
    expect(mockReleasePlaylistGenerationLease).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: true })
    );
  });

  it('releases the lease and re-throws when generation throws', async () => {
    mockGeneratePlaylist.mockRejectedValueOnce(new Error('Unexpected failure'));

    const { GET } = await import('@/app/api/cron/generate-playlist/route');

    await expect(GET(request())).rejects.toThrow('Unexpected failure');
    expect(mockReleasePlaylistGenerationLease).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: true })
    );
  });
});
