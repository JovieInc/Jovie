import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockGetCurrentUserEntitlements } = vi.hoisted(() => ({
  mockEnv: {
    HUD_KIOSK_TOKEN: undefined as string | undefined,
  },
  mockGetCurrentUserEntitlements: vi.fn(),
}));

const { mockFreshAuth, mockPrivacy } = vi.hoisted(() => ({
  mockFreshAuth: vi.fn(),
  mockPrivacy: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mockFreshAuth }));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: mockPrivacy,
}));

const { mockIsAdmin } = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: async (options?: { privileged?: boolean }) => {
    // This fixture represents expired admin MFA with an active privacy unlock.
    if (options?.privileged) return new Response(null, { status: 403 });
    const ent = await mockGetCurrentUserEntitlements();
    return ent.isAuthenticated && ent.userId && (await mockIsAdmin(ent.userId))
      ? null
      : new Response(null, { status: 403 });
  },
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
    mockFreshAuth.mockResolvedValue({ userId: null, sessionId: null });
    mockPrivacy.mockResolvedValue(undefined);
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

  it('denies valid kiosk token for a signed-in locked browser', async () => {
    mockEnv.HUD_KIOSK_TOKEN = 'kiosk-secret';
    mockFreshAuth.mockResolvedValue({ userId: 'u1', sessionId: 's1' });
    mockPrivacy.mockRejectedValue(Error('privacy locked'));
    const { authorizeHud } = await import('@/lib/auth/hud');
    await expect(authorizeHud('kiosk-secret')).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(mockPrivacy).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1' });
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

  it('allows fresh read identity even when admin MFA expired', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'admin_123',
    });
    mockIsAdmin.mockResolvedValue(true);

    const { authorizeHud } = await import('@/lib/auth/hud');

    await expect(authorizeHud(null, { session: 'fresh' })).resolves.toEqual({
      ok: true,
      mode: 'admin',
    });
    expect(mockIsAdmin).toHaveBeenCalledWith('admin_123');
  });
});
