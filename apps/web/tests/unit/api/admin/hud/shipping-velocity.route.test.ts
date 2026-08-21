import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  env: {
    HUD_GITHUB_TOKEN: undefined as string | undefined,
    HUD_GITHUB_OWNER: undefined as string | undefined,
    HUD_GITHUB_REPO: undefined as string | undefined,
  },
  getRedis: vi.fn(() => null),
  captureError: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlements,
}));

vi.mock('@/lib/env-server', () => ({
  env: hoisted.env,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: hoisted.getRedis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: hoisted.logger,
}));

describe('GET /api/admin/hud/shipping-velocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.env.HUD_GITHUB_TOKEN = undefined;
    hoisted.env.HUD_GITHUB_OWNER = undefined;
    hoisted.env.HUD_GITHUB_REPO = undefined;
    hoisted.getRedis.mockReturnValue(null);
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it('returns not_configured instead of zero buckets when GitHub is missing', async () => {
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      range: '7d',
      cachedAt: expect.any(String),
      observation: 'not_configured',
      errorMessage: 'GitHub is not configured for shipping velocity.',
    });
  });

  it('does not serve cached velocity when GitHub is no longer configured', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          date: '2026-08-20',
          merged: 3,
          opened: 1,
          closed: 0,
          mergeP50Hours: 2,
        },
      ],
      range: '7d',
      cachedAt: new Date().toISOString(),
      observation: 'fresh',
    });
    hoisted.getRedis.mockReturnValue({ get, set: vi.fn() });

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      range: '7d',
      cachedAt: expect.any(String),
      observation: 'not_configured',
      errorMessage: 'GitHub is not configured for shipping velocity.',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('returns 401 for signed-out users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
