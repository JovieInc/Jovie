import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/hud/metrics/route';

const mockAuthorizeHud = vi.hoisted(() => vi.fn());
const mockGetHudMetrics = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: mockAuthorizeHud,
}));

vi.mock('@/lib/hud/metrics', () => ({
  getHudMetrics: mockGetHudMetrics,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

describe('GET /api/hud/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
