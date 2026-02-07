import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: vi
    .fn()
    .mockResolvedValue({ mrrUsd: 123, activeSubscribers: 4 }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
  waitlistEntries: {},
}));

vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistEntries: {},
}));

// Mock heavy dependencies to prevent slow module resolution timeouts
vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('GET /api/admin/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not admin', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'user_123',
      email: 'user@example.com',
      isAuthenticated: true,
      isAdmin: false,
      isPro: false,
      hasAdvancedFeatures: false,
      canRemoveBranding: false,
    });

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns overview stats for admins', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'admin_123',
      email: 'admin@example.com',
      isAuthenticated: true,
      isAdmin: true,
      isPro: true,
      hasAdvancedFeatures: true,
      canRemoveBranding: true,
    });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockResolvedValue([{ count: 100 }]),
    });

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      mrrUsd: 123,
      waitlistCount: 100,
    });
  });
});
