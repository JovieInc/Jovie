import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();
const expireStaleInsightsMock = vi.fn();
const createGenerationRunMock = vi.fn();
const aggregateMetricsMock = vi.fn();
const getExistingInsightTypesMock = vi.fn();
const generateInsightsMock = vi.fn();
const persistInsightsMock = vi.fn();
const completeGenerationRunMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: executeMock,
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    CRON_SECRET: 'test-secret',
  },
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  expireStaleInsights: expireStaleInsightsMock,
  createGenerationRun: createGenerationRunMock,
  getExistingInsightTypes: getExistingInsightTypesMock,
  persistInsights: persistInsightsMock,
  completeGenerationRun: completeGenerationRunMock,
}));

vi.mock('@/lib/services/insights/data-aggregator', () => ({
  aggregateMetrics: aggregateMetricsMock,
}));

vi.mock('@/lib/services/insights/insight-generator', () => ({
  generateInsights: generateInsightsMock,
}));

describe('GET /api/cron/generate-insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    executeMock.mockResolvedValue({
      rows: [
        { profile_id: 'profile-1' },
        { profile_id: 'profile-2' },
        { profile_id: 'profile-3' },
        { profile_id: 'profile-4' },
        { profile_id: 'profile-5' },
        { profile_id: 'profile-6' },
      ],
    });

    expireStaleInsightsMock.mockResolvedValue(0);
    aggregateMetricsMock.mockResolvedValue({
      traffic: { totalClicksCurrent: 20, totalClicksPrevious: 20 },
      period: { start: '2025-01-01', end: '2025-01-31' },
      comparisonPeriod: { start: '2024-12-01', end: '2024-12-31' },
    });
    getExistingInsightTypesMock.mockResolvedValue([]);
    generateInsightsMock.mockResolvedValue({
      insights: [],
      modelUsed: 'gpt',
      promptTokens: 10,
      completionTokens: 10,
    });
    persistInsightsMock.mockResolvedValue(1);
    completeGenerationRunMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('processes eligible profiles concurrently in chunks', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    createGenerationRunMock.mockImplementation(async (profileId: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 25));
      inFlight--;
      return { id: `run-${profileId}` };
    });

    const { GET } = await import('@/app/api/cron/generate-insights/route');

    const response = await GET(
      new Request('http://localhost/api/cron/generate-insights', {
        headers: { authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(data.stats.processed).toBe(6);
    expect(data.stats.insightsGenerated).toBe(6);
  });
});
