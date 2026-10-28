import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdateSet = vi.hoisted(() => vi.fn());
const mockDbUpdateWhere = vi.hoisted(() => vi.fn());
const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockStripeList = vi.hoisted(() => vi.fn());
const mockReplayUnprocessedStripeWebhooks = vi.hoisted(() => vi.fn());

vi.mock('@/lib/billing/webhook-replay', () => ({
  replayUnprocessedStripeWebhooks: mockReplayUnprocessedStripeWebhooks,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: vi.fn(() => ({
      set: mockDbUpdateSet,
    })),
    insert: vi.fn(() => ({
      values: mockDbInsertValues,
    })),
  },
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn((operation: (tx: unknown) => unknown) =>
    operation({
      insert: vi.fn(() => ({ values: mockDbInsertValues })),
    })
  ),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
    isPro: 'isPro',
    isAdmin: 'isAdmin',
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
    mockReplayUnprocessedStripeWebhooks.mockResolvedValue({
      processed: 0,
      blocked: [],
      failed: [],
      needsReconciliation: [],
    });
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
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'reconciliation_run',
        source: 'reconciliation',
        metadata: expect.objectContaining({
          action: 'reconciliation_run',
          success: true,
          webhookReplay: {
            processed: 0,
            blocked: [],
            failed: [],
            needsReconciliation: [],
          },
        }),
      })
    );
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
    expect(data.stats.fixed).toBe(1);
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: 'sub_trialing',
      })
    );
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('downgrades a Pro user with no active subscription through the shared writer, resetting the plan', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    mockStripeList.mockResolvedValueOnce({
      data: [{ id: 'sub_old', customer: 'cus_9', status: 'canceled' }],
      has_more: false,
    });
    const empty = () => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDbSelect
      .mockReturnValueOnce(empty())
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'user_9',
                clerkId: 'clerk_9',
                isPro: true,
                stripeCustomerId: 'cus_9',
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce(empty());

    const { GET } = await import('@/app/api/cron/billing-reconciliation/route');
    const response = await GET(
      new Request('http://localhost/api/cron/billing-reconciliation', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_9',
        isPro: false,
        stripeSubscriptionId: null,
        source: 'reconciliation',
        metadata: { reason: 'no_active_subscription' },
      })
    );
    // No direct users.update that would leave plan='pro', isPro=false.
    expect(mockDbUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ isPro: false })
    );
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
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Billing reconciliation found issues',
      undefined,
      expect.objectContaining({
        stats: expect.objectContaining({ errors: 1 }),
      })
    );
  });

  it('fails closed when the reconciliation run receipt cannot be written', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    // Audit log insert fails
    mockDbInsertValues.mockRejectedValue(new Error('Audit insert failed'));

    mockStripeList.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_active',
          customer: 'cus_123',
          status: 'active',
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

    // The user repair still happens, but the cron cannot claim success without
    // its durable reconciliation_run receipt.
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Billing audit log insert failed after user update',
      expect.any(Error),
      expect.objectContaining({ userId: 'user_1' })
    );
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Billing reconciliation failed',
      expect.any(Error),
      {}
    );
    expect(mockCaptureWarning).not.toHaveBeenCalled();
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
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'reconciliation_run',
        source: 'reconciliation',
        metadata: expect.objectContaining({
          action: 'reconciliation_run',
          success: false,
          failure: { name: 'Error', message: 'Database error' },
        }),
      })
    );
  });
});
