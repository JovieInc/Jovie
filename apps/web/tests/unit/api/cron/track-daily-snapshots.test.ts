import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyCronRequestMock = vi.fn();
const runLiveMock = vi.fn();
const captureErrorMock = vi.fn();
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/track-snapshots/live', () => ({
  runLiveTrackDailySnapshots: runLiveMock,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: captureErrorMock }));

const URL_ = 'https://jov.ie/api/cron/track-daily-snapshots';

describe('GET /api/cron/track-daily-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    verifyCronRequestMock.mockReturnValue(null);
    captureErrorMock.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated callers', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import('@/app/api/cron/track-daily-snapshots/route');
    expect((await GET(new Request(URL_))).status).toBe(401);
    expect(runLiveMock).not.toHaveBeenCalled();
  });

  it('honours the kill switch', async () => {
    vi.stubEnv('TRACK_DAILY_SNAPSHOTS', 'false');
    const { GET } = await import('@/app/api/cron/track-daily-snapshots/route');
    const response = await GET(new Request(URL_));
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: false,
      skipped: 'kill_switch',
    });
    expect(runLiveMock).not.toHaveBeenCalled();
  });

  it('runs by default and returns the report', async () => {
    runLiveMock.mockResolvedValue({
      day: '2026-11-02',
      rowsInserted: 3,
      failures: [],
    });
    const { GET } = await import('@/app/api/cron/track-daily-snapshots/route');
    const response = await GET(new Request(URL_));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      rowsInserted: 3,
    });
  });

  it('fingerprints a thrown failure', async () => {
    runLiveMock.mockRejectedValue(new Error('db down'));
    const { GET } = await import('@/app/api/cron/track-daily-snapshots/route');
    const response = await GET(new Request(URL_));
    expect(response.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Track daily snapshots failed',
      expect.any(Error),
      expect.objectContaining({ fingerprint: 'remediation:track-snapshots' })
    );
  });
});
