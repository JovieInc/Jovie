import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const hoisted = vi.hoisted(() => ({
  requireAdminHudApiAccess: vi.fn(),
  loadOvieLauncherInventory: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/hud/require-admin-hud-api', () => ({
  requireAdminHudApiAccess: hoisted.requireAdminHudApiAccess,
}));

vi.mock('@/lib/hud/ovie-launchers.server', () => ({
  loadOvieLauncherInventory: hoisted.loadOvieLauncherInventory,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

describe('GET /api/admin/hud/ovie-launchers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdminHudApiAccess.mockResolvedValue(null);
  });

  it('returns 401 when the HUD API gate denies the caller', async () => {
    hoisted.requireAdminHudApiAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    const { GET } = await import('@/app/api/admin/hud/ovie-launchers/route');
    const response = await GET();
    expect(response.status).toBe(401);
    expect(hoisted.loadOvieLauncherInventory).not.toHaveBeenCalled();
  });

  it('returns the ranked inventory for admins', async () => {
    hoisted.loadOvieLauncherInventory.mockResolvedValue({
      generatedAtIso: '2026-08-31T00:00:00.000Z',
      primary: [{ id: 'gbrain', label: 'GBrain' }],
      advanced: [],
      all: [{ id: 'gbrain', label: 'GBrain' }],
    });
    const { GET } = await import('@/app/api/admin/hud/ovie-launchers/route');
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      primary: [{ id: 'gbrain' }],
    });
  });
});
