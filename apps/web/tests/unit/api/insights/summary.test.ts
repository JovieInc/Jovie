import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  getInsightsSummaryMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  getInsightsSummary: hoisted.getInsightsSummaryMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('GET /api/insights/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns empty summary for non-pro users', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: false });

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual([]);
    expect(body.totalActive).toBe(0);
    expect(body.lastGeneratedAt).toBeNull();
  });

  it('returns empty summary when no profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual([]);
  });

  it('returns summary for pro users', async () => {
    const mockSummary = {
      insights: [{ id: 'ins_1', title: 'Growth trending up' }],
      totalActive: 5,
      lastGeneratedAt: '2026-03-28T00:00:00Z',
    };
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getInsightsSummaryMock.mockResolvedValue(mockSummary);

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual(mockSummary.insights);
    expect(body.totalActive).toBe(5);
  });

  it('returns 200 with empty result on profile not found error', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getInsightsSummaryMock.mockRejectedValue(
      new Error('Profile not found')
    );

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insights).toEqual([]);
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.getInsightsSummaryMock.mockRejectedValue(new Error('DB crash'));

    const { GET } = await import('@/app/api/insights/summary/route');
    const response = await GET();

    expect(response.status).toBe(500);
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});
