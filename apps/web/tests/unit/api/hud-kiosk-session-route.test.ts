import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminHudApiAccessMock = vi.fn();

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: requireAdminHudApiAccessMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: { HUD_KIOSK_TOKEN: 'tv-token' },
}));

describe('GET /api/hud/kiosk-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin callers', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const { GET } = await import('@/app/api/hud/kiosk-session/route');
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns the kiosk token for a signed-in admin', async () => {
    requireAdminHudApiAccessMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/hud/kiosk-session/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token).toBe('tv-token');
  });
});
