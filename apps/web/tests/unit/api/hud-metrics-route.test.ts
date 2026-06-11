import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/hud/metrics/route';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';

const mockAuthorizeHud = vi.hoisted(() => vi.fn());
const mockGetHudMetrics = vi.hoisted(() => vi.fn());
const mockBuildDegradedHudMetrics = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: mockAuthorizeHud,
}));

vi.mock('@/lib/hud/metrics', () => ({
  buildDegradedHudMetrics: mockBuildDegradedHudMetrics,
  getHudMetrics: mockGetHudMetrics,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}));

describe('GET /api/hud/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns degraded metrics without reporting timeout errors to Sentry', async () => {
    const request = new NextRequest('http://localhost:3000/api/hud/metrics');
    const timeoutError = new ServerFetchTimeoutError(
      'External request timed out after 8000ms',
      8000,
      'Mercury checking balance'
    );
    const degradedMetrics = {
      accessMode: 'admin',
      operations: { status: 'degraded' },
    };

    mockAuthorizeHud.mockResolvedValueOnce({ ok: true, mode: 'admin' });
    mockGetHudMetrics.mockRejectedValueOnce(timeoutError);
    mockBuildDegradedHudMetrics.mockReturnValueOnce(degradedMetrics);

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(degradedMetrics);
    expect(mockBuildDegradedHudMetrics).toHaveBeenCalledWith('admin', {
      context: 'Mercury checking balance',
      timeoutMs: 8000,
    });
    expect(mockCaptureError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'HUD metrics route timed out; returning degraded payload',
      expect.objectContaining({
        route: '/api/hud/metrics',
        context: 'Mercury checking balance',
        timeoutMs: 8000,
      })
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('captures and logs failures with route context', async () => {
    const request = new NextRequest('http://localhost:3000/api/hud/metrics');
    const routeError = new Error('metrics unavailable');

    mockAuthorizeHud.mockResolvedValueOnce({ ok: true, mode: 'hud' });
    mockGetHudMetrics.mockRejectedValueOnce(routeError);

    const response = await GET(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load HUD metrics',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'HUD metrics route failed',
      routeError,
      expect.objectContaining({
        route: '/api/hud/metrics',
      })
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Error in HUD metrics API:',
      routeError
    );
  });
});
