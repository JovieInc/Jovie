import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGeneratePlaylist,
  mockGetPlaylistEngineSettings,
  mockGetPlaylistSpotifyStatus,
  mockMarkPlaylistGeneratedAt,
  mockVerifyCronRequest,
} = vi.hoisted(() => ({
  mockGeneratePlaylist: vi.fn(),
  mockGetPlaylistEngineSettings: vi.fn(),
  mockGetPlaylistSpotifyStatus: vi.fn(),
  mockMarkPlaylistGeneratedAt: vi.fn(),
  mockVerifyCronRequest: vi.fn(),
}));

vi.mock('@/lib/admin/platform-connections', () => ({
  getPlaylistEngineSettings: mockGetPlaylistEngineSettings,
  getPlaylistSpotifyStatus: mockGetPlaylistSpotifyStatus,
  markPlaylistGeneratedAt: mockMarkPlaylistGeneratedAt,
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
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
    expect(mockGeneratePlaylist).toHaveBeenCalledWith({
      skipComplianceCheck: true,
    });
    expect(mockMarkPlaylistGeneratedAt).toHaveBeenCalledWith(expect.any(Date));
  });
});
