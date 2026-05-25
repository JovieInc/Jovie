import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockGetCurrentUserEntitlements } = vi.hoisted(() => ({
  mockEnv: {
    HUD_KIOSK_TOKEN: undefined as string | undefined,
  },
  mockGetCurrentUserEntitlements: vi.fn(),
}));

const { mockIsAdmin } = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

describe('authorizeHud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockEnv.HUD_KIOSK_TOKEN = undefined;
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
      userId: null,
    });
    mockIsAdmin.mockResolvedValue(false);
  });

  it('allows a valid kiosk token without loading Clerk entitlements', async () => {
    mockEnv.HUD_KIOSK_TOKEN = 'kiosk-secret';

    const { authorizeHud } = await import('@/lib/auth/hud');

    await expect(authorizeHud('kiosk-secret')).resolves.toEqual({
      ok: true,
      mode: 'kiosk',
    });
    expect(mockGetCurrentUserEntitlements).not.toHaveBeenCalled();
  });

  it('falls back to not configured when Clerk context is unavailable and no kiosk token is configured', async () => {
    mockGetCurrentUserEntitlements.mockRejectedValue(
      new Error('Clerk missing')
    );

    const { authorizeHud } = await import('@/lib/auth/hud');

    await expect(authorizeHud(null)).resolves.toEqual({
      ok: false,
      reason: 'not_configured',
    });
  });

  it('falls back to unauthorized when Clerk context is unavailable and the kiosk token is wrong', async () => {
    mockEnv.HUD_KIOSK_TOKEN = 'kiosk-secret';
    mockGetCurrentUserEntitlements.mockRejectedValue(
      new Error('Clerk missing')
    );

    const { authorizeHud } = await import('@/lib/auth/hud');

    await expect(authorizeHud('wrong-token')).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });

  it('allows the raw admin role even when fresh MFA is unavailable', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'admin_123',
    });
    mockIsAdmin.mockResolvedValue(true);

    const { authorizeHud } = await import('@/lib/auth/hud');

    await expect(authorizeHud(null)).resolves.toEqual({
      ok: true,
      mode: 'admin',
    });
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_123');
  });
});
