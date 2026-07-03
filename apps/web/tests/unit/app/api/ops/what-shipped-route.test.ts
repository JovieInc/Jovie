import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  readWhatShippedFeed: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.getCurrentUserEntitlements,
}));

vi.mock('@/lib/ops/what-shipped', () => ({
  readWhatShippedFeed: mocks.readWhatShippedFeed,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

describe('GET /api/ops/what-shipped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated users', async () => {
    mocks.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mocks.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('returns the feed for admin users', async () => {
    const feed = {
      available: true,
      generatedAt: '2026-07-03T10:05:34.770172+00:00',
      items: [],
    };
    mocks.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mocks.readWhatShippedFeed.mockResolvedValue(feed);

    const { GET } = await import('@/app/api/ops/what-shipped/route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(feed);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
