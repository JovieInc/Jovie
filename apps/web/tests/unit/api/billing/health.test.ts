import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockStripeSubscriptionsList = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  billingAuditLog: {},
  stripeWebhookEvents: {},
  users: {},
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      list: mockStripeSubscriptionsList,
    },
  },
}));

vi.mock('@/lib/stripe/config', () => ({
  validateStripeConfig: vi.fn(() => ({ isValid: true, missingVars: [] })),
  getActivePriceIds: vi.fn(() => ['price_test_monthly', 'price_test_yearly']),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));

const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

function mockHealthQueries(queryResults: unknown[]) {
  let queryIndex = 0;

  mockDbSelect.mockImplementation(() => {
    const result = queryResults[queryIndex] ?? [];
    queryIndex += 1;
    const resolved = Promise.resolve(result);

    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
          then: resolved.then.bind(resolved),
          catch: resolved.catch.bind(resolved),
          finally: resolved.finally.bind(resolved),
        }),
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      }),
    };
  });
}

describe('GET /api/billing/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns healthy status when all checks pass', async () => {
    const lastReconciliationAt = new Date();
    const lastBillingEventAt = new Date();
    mockHealthQueries([
      [{ count: 1 }],
      [{ count: 0 }],
      [{ createdAt: lastReconciliationAt }],
      [{ count: 1 }],
      [{ lastBillingEventAt }],
    ]);

    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1' }],
      has_more: false,
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('healthy');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('checks');
    expect(data).toHaveProperty('metrics');
    expect(data.metrics.lastReconciliationAt).toBe(
      lastReconciliationAt.toISOString()
    );
    expect(data.metrics.lastBillingEventAt).toBe(
      lastBillingEventAt.toISOString()
    );
  });

  it('serializes neon-http string timestamps without throwing', async () => {
    const lastReconciliationAt = new Date().toISOString();
    const lastBillingEventAt = new Date(Date.now() - 60_000).toISOString();
    mockHealthQueries([
      [{ count: 1 }],
      [{ count: 0 }],
      [{ createdAt: lastReconciliationAt }],
      [{ count: 1 }],
      [{ lastBillingEventAt }],
    ]);

    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1' }],
      has_more: false,
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metrics.lastReconciliationAt).toBe(lastReconciliationAt);
    expect(data.metrics.lastBillingEventAt).toBe(lastBillingEventAt);
    expect(data.checks.recentReconciliation.status).toBe('healthy');
    expect(data.checks.recentReconciliation.details.lastRun).toBe(
      lastReconciliationAt
    );
  });

  it('warns when a string reconciliation timestamp is stale', async () => {
    const lastReconciliationAt = new Date(
      Date.now() - 5 * 60 * 60 * 1000
    ).toISOString();
    mockHealthQueries([
      [{ count: 1 }],
      [{ count: 0 }],
      [{ createdAt: lastReconciliationAt }],
      [{ count: 1 }],
      [{ lastBillingEventAt: lastReconciliationAt }],
    ]);

    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1' }],
      has_more: false,
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.healthy).toBe(true);
    expect(data.checks.recentReconciliation.status).toBe('warning');
    expect(data.metrics.lastReconciliationAt).toBe(lastReconciliationAt);
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('does not file Sentry for warning-level checks (JOV-5242)', async () => {
    const lastReconciliationAt = new Date();
    mockHealthQueries([
      [{ count: 0 }],
      [{ count: 0 }],
      [{ createdAt: lastReconciliationAt }],
      [{ count: 1 }],
      [{ lastBillingEventAt: lastReconciliationAt }],
    ]);

    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1' }],
      has_more: false,
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.healthy).toBe(true);
    expect(data.checks.webhooksProcessing.status).toBe('warning');
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('still reports critical billing health to Sentry', async () => {
    const lastReconciliationAt = new Date();
    mockHealthQueries([
      [{ count: 1 }],
      [{ count: 11 }],
      [{ createdAt: lastReconciliationAt }],
      [{ count: 1 }],
      [{ lastBillingEventAt: lastReconciliationAt }],
    ]);

    mockStripeSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1' }],
      has_more: false,
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.healthy).toBe(false);
    expect(data.checks.noStuckWebhooks.status).toBe('critical');
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Billing health check critical',
      undefined,
      expect.objectContaining({
        service: 'billing',
        route: '/api/billing/health',
      })
    );
  });

  it('returns 503 on critical failure', async () => {
    mockDbSelect.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const { GET } = await import('@/app/api/billing/health/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.healthy).toBe(false);
    expect(data.error).toBeDefined();
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Billing health check failed',
      expect.any(Error),
      expect.objectContaining({
        service: 'billing',
        route: '/api/billing/health',
      })
    );
  });
});
