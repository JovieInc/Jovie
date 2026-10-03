import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyCronRequestMock = vi.fn();
const runLiveMock = vi.fn();
const captureErrorMock = vi.fn();
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/artist-snapshots/live', () => ({
  runLiveArtistDailySnapshots: runLiveMock,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));
describe('GET /api/cron/artist-daily-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    verifyCronRequestMock.mockReturnValue(null);
    captureErrorMock.mockResolvedValue(undefined);
  });
  it('rejects unauthenticated callers before reading the flag', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import('@/app/api/cron/artist-daily-snapshots/route');
    const response = await GET(
      new Request('https://jov.ie/api/cron/artist-daily-snapshots')
    );
    expect(response.status).toBe(401);
    expect(runLiveMock).not.toHaveBeenCalled();
  });
  it('stays a no-op while the flag is off', async () => {
    vi.stubEnv('ARTIST_DAILY_SNAPSHOTS', 'false');
    const { GET } = await import('@/app/api/cron/artist-daily-snapshots/route');
    const response = await GET(
      new Request('https://jov.ie/api/cron/artist-daily-snapshots')
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: false,
      skipped: 'flag_off',
    });
    expect(runLiveMock).not.toHaveBeenCalled();
  });
  it('runs when the flag is on and fingerprints a thrown failure', async () => {
    vi.stubEnv('ARTIST_DAILY_SNAPSHOTS', 'true');
    runLiveMock.mockRejectedValue(new Error('db down'));
    const { GET } = await import('@/app/api/cron/artist-daily-snapshots/route');
    const response = await GET(
      new Request('https://jov.ie/api/cron/artist-daily-snapshots')
    );
    expect(runLiveMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Artist daily snapshots failed',
      expect.any(Error),
      expect.objectContaining({
        fingerprint: 'remediation:artist-snapshots',
        route: '/api/cron/artist-daily-snapshots',
      })
    );
  });
});
