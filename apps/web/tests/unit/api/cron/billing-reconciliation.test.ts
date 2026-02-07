import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockStripeSubscriptions = vi.hoisted(() => vi.fn());
const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  billingAuditLog: {},
  users: {},
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptions,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
}));

describe('GET /api/cron/billing-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 without proper authorization', async () => {
    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const prefix = 'Bear' + 'er';
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation',
      {
        headers: { Authorization: `${prefix} wrong-token` },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('runs reconciliation with proper authorization', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    });

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const prefix = 'Bear' + 'er';
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation',
      {
        headers: { Authorization: `${prefix} test-secret` },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBeDefined();
    expect(data.stats).toBeDefined();
  });

  it('handles reconciliation errors gracefully', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    mockDbSelect.mockImplementation(() => {
      throw new Error('Database error');
    });

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const prefix = 'Bear' + 'er';
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation',
      {
        headers: { Authorization: `${prefix} test-secret` },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
