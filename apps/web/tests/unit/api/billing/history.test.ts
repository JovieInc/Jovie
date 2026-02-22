import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetUserBillingInfo = vi.hoisted(() => vi.fn());
const mockGetBillingAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
  getBillingAuditLog: mockGetBillingAuditLog,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('GET /api/billing/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/billing/history/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('filters audit log entries to safe fields', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_123',
        email: 'user@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        billingVersion: 3,
        lastBillingEventAt: null,
      },
    });
    mockGetBillingAuditLog.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'log_123',
          eventType: 'payment_failed',
          previousState: { stripeCustomerId: 'cus_123' },
          newState: { isPro: false, plan: 'free' },
          stripeEventId: 'evt_abcdef1234',
          source: 'webhook',
          metadata: {
            amountDue: 4900,
            currency: 'usd',
            subscriptionStatus: 'past_due',
            invoiceId: 'in_12345',
          },
          createdAt: new Date('2025-01-15T10:30:00Z'),
        },
      ],
    });

    const { GET } = await import('@/app/api/billing/history/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toEqual({
      eventType: 'payment_failed',
      timestamp: '2025-01-15T10:30:00.000Z',
      amount: 4900,
      currency: 'usd',
      status: 'past_due',
      maskedIdentifier: '****1234',
    });
  });
});
