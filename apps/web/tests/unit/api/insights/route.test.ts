import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getActiveInsightsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  getActiveInsights: hoisted.getActiveInsightsMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('GET /api/insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request('http://localhost/api/insights');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns empty insights for non-pro users', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: false });

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request('http://localhost/api/insights');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns insights for pro users', async () => {
    const mockInsights = [
      { id: 'ins_1', category: 'growth', title: 'Growth insight' },
    ];
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getActiveInsightsMock.mockResolvedValue({
      insights: mockInsights,
      total: 1,
    });

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request('http://localhost/api/insights');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual(mockInsights);
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it('passes category and priority filters', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getActiveInsightsMock.mockResolvedValue({
      insights: [],
      total: 0,
    });

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request(
      'http://localhost/api/insights?category=growth,revenue&priority=high&limit=5&offset=10'
    );
    await GET(request);

    expect(hoisted.getActiveInsightsMock).toHaveBeenCalledWith('profile_123', {
      category: ['growth', 'revenue'],
      priority: ['high'],
      limit: 5,
      offset: 10,
    });
  });

  it('calculates hasMore correctly', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getActiveInsightsMock.mockResolvedValue({
      insights: [{ id: '1' }],
      total: 25,
    });

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request(
      'http://localhost/api/insights?limit=10&offset=0'
    );
    const response = await GET(request);

    const body = await response.json();
    expect(body.hasMore).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getActiveInsightsMock.mockRejectedValue(new Error('DB error'));

    const { GET } = await import('@/app/api/insights/route');
    const request = new Request('http://localhost/api/insights');
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});
