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

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

describe('GET /api/billing/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns healthy status when all checks pass', async () => {
    // Mock database queries
    const fromMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ createdAt: new Date() }]),
        }),
      }),
    });

    mockDbSelect.mockReturnValue({ from: fromMock });

    // Mock Stripe subscription list
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
  });
});
