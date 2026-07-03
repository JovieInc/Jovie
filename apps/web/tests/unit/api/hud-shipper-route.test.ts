import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminHudApiAccessMock = vi.fn();
const getHudShipperStatusMock = vi.fn();

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: requireAdminHudApiAccessMock,
}));

vi.mock('@/lib/hud/shipper-state', () => ({
  getHudShipperStatus: getHudShipperStatusMock,
}));

describe('GET /api/admin/hud/shipper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin callers', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const { GET } = await import('@/app/api/admin/hud/shipper/route');
    const response = await GET();

    expect(response.status).toBe(403);
    expect(getHudShipperStatusMock).not.toHaveBeenCalled();
  });

  it('returns shipper payload for admin callers', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(null);
    getHudShipperStatusMock.mockReturnValue({
      availability: 'available',
      state: 'idle',
      inFlightCount: 0,
      inFlightJobs: [],
      generatedAtIso: '2026-07-03T12:00:00.000Z',
    });

    const { GET } = await import('@/app/api/admin/hud/shipper/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state).toBe('idle');
  });
});
