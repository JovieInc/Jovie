import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  getFounderFunnelData: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: hoisted.getFounderFunnelData,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

describe('GET /api/admin/hud/founder-funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
  });

  it('returns 503 when the funnel query reports errors instead of all-zero success', async () => {
    hoisted.getFounderFunnelData.mockResolvedValue({
      timeRange: '30d',
      biggestDropOffKey: null,
      errors: ['connection refused'],
      stages: [
        {
          key: 'onboarding_chats',
          label: 'Onboarding chats',
          description: 'chats',
          count: 0,
          conversionRate: null,
          dropOff: null,
        },
      ],
    });

    const { GET } = await import('@/app/api/admin/hud/founder-funnel/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/founder-funnel?range=30d')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'connection refused',
    });
  });

  it('returns 401 for signed-out users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    const { GET } = await import('@/app/api/admin/hud/founder-funnel/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/founder-funnel')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
