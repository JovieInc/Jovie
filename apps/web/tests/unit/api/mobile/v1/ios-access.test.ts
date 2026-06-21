import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlementsMock: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
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
  });

  it('allows authenticated users without the old rollout gate', async () => {
    process.env.IOS_TESTFLIGHT_PUBLIC_LINK =
      'https://testflight.apple.com/join/example';
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user_123',
      isAdmin: false,
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      hasAccess: true,
      installUrl: 'https://testflight.apple.com/join/example',
    });
  });

  it('does not expose an install URL until one is configured', async () => {
    const { GET } = await routeModulePromise;
    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      hasAccess: true,
      installUrl: null,
    });
  });
});
