import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  getCurrentUserEntitlementsMock: vi.fn(),
  canGenerateInsightsMock: vi.fn(),
  createGenerationRunMock: vi.fn(),
  completeGenerationRunMock: vi.fn(),
  aggregateMetricsMock: vi.fn(),
  generateInsightsMock: vi.fn(),
  persistInsightsMock: vi.fn(),
  getExistingInsightTypesMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlementsMock,
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  canGenerateInsights: hoisted.canGenerateInsightsMock,
  createGenerationRun: hoisted.createGenerationRunMock,
  completeGenerationRun: hoisted.completeGenerationRunMock,
  persistInsights: hoisted.persistInsightsMock,
  getExistingInsightTypes: hoisted.getExistingInsightTypesMock,
}));

vi.mock('@/lib/services/insights/data-aggregator', () => ({
  aggregateMetrics: hoisted.aggregateMetricsMock,
}));

vi.mock('@/lib/services/insights/insight-generator', () => ({
  generateInsights: hoisted.generateInsightsMock,
}));

vi.mock('@/lib/services/insights/thresholds', () => ({
  MIN_TOTAL_CLICKS: 10,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('POST /api/insights/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('Unauthorized'));

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(401);
  });

  it('returns 404 when profile not found', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(404);
  });

  it('returns 403 for non-pro users', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: false });

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.canGenerateInsightsMock.mockResolvedValue({
      allowed: false,
      nextAllowedAt: new Date('2026-04-01'),
    });

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.nextAllowedAt).toBeDefined();
  });

  it('returns 200 with 0 insights when insufficient data', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.canGenerateInsightsMock.mockResolvedValue({ allowed: true });
    hoisted.createGenerationRunMock.mockResolvedValue({ id: 'run_123' });
    hoisted.aggregateMetricsMock.mockResolvedValue({
      traffic: { totalClicksCurrent: 3, totalClicksPrevious: 2 },
    });
    hoisted.completeGenerationRunMock.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insightsGenerated).toBe(0);
    expect(body.message).toContain('Insufficient data');
  });

  it('generates and persists insights successfully', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.canGenerateInsightsMock.mockResolvedValue({ allowed: true });
    hoisted.createGenerationRunMock.mockResolvedValue({ id: 'run_123' });
    hoisted.aggregateMetricsMock.mockResolvedValue({
      traffic: { totalClicksCurrent: 50, totalClicksPrevious: 30 },
      period: { start: new Date(), end: new Date() },
      comparisonPeriod: { start: new Date(), end: new Date() },
    });
    hoisted.getExistingInsightTypesMock.mockResolvedValue([]);
    hoisted.generateInsightsMock.mockResolvedValue({
      insights: [{ type: 'growth', title: 'Test' }],
      modelUsed: 'claude-3',
      promptTokens: 100,
      completionTokens: 200,
    });
    hoisted.persistInsightsMock.mockResolvedValue(1);
    hoisted.completeGenerationRunMock.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.insightsGenerated).toBe(1);
    expect(body.status).toBe('completed');
  });

  it('marks run as failed on generation error', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.getCurrentUserEntitlementsMock.mockResolvedValue({ isPro: true });
    hoisted.canGenerateInsightsMock.mockResolvedValue({ allowed: true });
    hoisted.createGenerationRunMock.mockResolvedValue({ id: 'run_123' });
    hoisted.aggregateMetricsMock.mockRejectedValue(new Error('Aggregation failed'));
    hoisted.completeGenerationRunMock.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/insights/generate/route');
    const response = await POST();

    expect(response.status).toBe(500);
    expect(hoisted.completeGenerationRunMock).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ status: 'failed' })
    );
  });
});
