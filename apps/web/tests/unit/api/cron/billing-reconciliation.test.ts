import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdateSet = vi.hoisted(() => vi.fn());
const mockDbUpdateWhere = vi.hoisted(() => vi.fn());
const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockStripeList = vi.hoisted(() => vi.fn());

const mockDbTransaction = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: vi.fn(() => ({
      set: mockDbUpdateSet,
    })),
    insert: vi.fn(() => ({
      values: mockDbInsertValues,
    })),
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
    isPro: 'isPro',
    stripeSubscriptionId: 'stripeSubscriptionId',
    stripeCustomerId: 'stripeCustomerId',
    billingUpdatedAt: 'billingUpdatedAt',
    billingVersion: 'billingVersion',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('@/lib/db/schema/billing', () => ({
  billingAuditLog: {
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      list: mockStripeList,
    },
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: mockCaptureWarning,
}));

describe('GET /api/cron/billing-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');

    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockDbUpdateWhere.mockResolvedValue(undefined);
    mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateWhere });
    mockDbInsertValues.mockResolvedValue(undefined);
    mockStripeList.mockResolvedValue({ data: [], has_more: false });
    // Mock transaction to invoke callback with a tx that has update/insert
    mockDbTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          update: vi.fn(() => ({
            set: mockDbUpdateSet,
          })),
          insert: vi.fn(() => ({
            values: mockDbInsertValues,
          })),
        };
        return callback(mockTx);
      }
    );
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

    mockDbSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
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

  it('links trialing subscriptions for pro users missing stripeSubscriptionId', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    mockStripeList.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_trialing',
          customer: 'cus_123',
          status: 'trialing',
        },
      ],
      has_more: false,
    });

    mockDbSelect
      // users with subscription ids
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      })
      // pro users without subscription ids
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user_1',
                clerkId: 'clerk_1',
                isPro: true,
                stripeCustomerId: 'cus_123',
              },
            ]),
          }),
        }),
      })
      // stale customers
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
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
    expect(data.success).toBe(true);
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: 'sub_trialing',
      })
    );
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
  });

  it('continues second-pass repairs when one user repair fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    mockStripeList
      .mockRejectedValueOnce(new Error('Stripe timeout'))
      .mockResolvedValueOnce({
        data: [
          {
            id: 'sub_active',
            customer: 'cus_2',
            status: 'active',
          },
        ],
        has_more: false,
      });

    mockDbSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user_1',
                clerkId: 'clerk_1',
                isPro: true,
                stripeCustomerId: 'cus_1',
              },
              {
                id: 'user_2',
                clerkId: 'clerk_2',
                isPro: true,
                stripeCustomerId: 'cus_2',
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
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
    expect(data.success).toBe(false);
    expect(data.stats.fixed).toBe(1);
    expect(data.stats.errors).toBe(1);
    expect(data.errors[0]).toContain('user user_1: Stripe timeout');
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: 'sub_active',
      })
    );
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
