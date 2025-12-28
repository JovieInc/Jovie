import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.CRON_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns 401 without proper authorization in production', async () => {
    process.env.NODE_ENV = 'production';

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation',
      {
        headers: { Authorization: 'Bearer wrong-secret' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('runs reconciliation with proper authorization', async () => {
    process.env.NODE_ENV = 'production';

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation',
      {
        headers: { Authorization: 'Bearer test-secret' },
      }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBeDefined();
    expect(data.stats).toBeDefined();
  });

  it('handles reconciliation errors gracefully', async () => {
    process.env.NODE_ENV = 'test';

    mockDbSelect.mockImplementation(() => {
      throw new Error('Database error');
    });

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const request = new Request(
      'http://localhost/api/cron/billing-reconciliation'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });
});
