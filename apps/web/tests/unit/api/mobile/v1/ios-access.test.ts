import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlementsMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: hoisted.getAppFlagValueMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/ios-access/route');

describe('GET /api/mobile/v1/ios-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IOS_TESTFLIGHT_PUBLIC_LINK;
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user_123',
      isAdmin: false,
    });
    hoisted.getAppFlagValueMock.mockResolvedValue(false);
  });

  it('returns no-store signed-out access state', async () => {
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      isAdmin: false,
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      hasAccess: false,
      installUrl: null,
    });
    expect(hoisted.getAppFlagValueMock).not.toHaveBeenCalled();
  });

  it('allows admins through even when the rollout gate is off', async () => {
    process.env.IOS_TESTFLIGHT_PUBLIC_LINK =
      'https://testflight.apple.com/join/example';
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: true,
      userId: 'admin_123',
      isAdmin: true,
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
    expect(hoisted.getAppFlagValueMock).toHaveBeenCalledWith(
      'IOS_APP_ALPHA_ACCESS',
      { userId: 'admin_123' }
    );
  });

  it('allows rollout-gated alpha users', async () => {
    process.env.IOS_TESTFLIGHT_PUBLIC_LINK =
      'https://testflight.apple.com/join/example';
    hoisted.getAppFlagValueMock.mockResolvedValue(true);

    const { GET } = await routeModulePromise;
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
  });
});
