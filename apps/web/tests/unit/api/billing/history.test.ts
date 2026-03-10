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
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

const AUTHENTICATED_BILLING_INFO = {
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
};

describe('GET /api/billing/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetUserBillingInfo.mockResolvedValue(AUTHENTICATED_BILLING_INFO);
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

    expect(Object.keys(data.entries[0]).sort()).toEqual([
      'amount',
      'currency',
      'eventType',
      'maskedIdentifier',
      'status',
      'timestamp',
    ]);
  });

  it('does not leak Stripe identifiers or internal metadata fields', async () => {
    mockGetBillingAuditLog.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'log_987',
          eventType: 'invoice_payment_failed',
          previousState: { stripeCustomerId: 'cus_abc1234' },
          newState: {
            isPro: true,
            plan: 'pro',
            internalNotes: 'sensitive-note',
          },
          stripeEventId: 'evt_abc123456789',
          source: 'webhook',
          metadata: {
            amountDue: 2500,
            currency: 'usd',
            subscriptionId: 'sub_abc123456789',
            stripeCustomerId: 'cus_abc123456789',
            rawPayload: { customer: 'cus_abc123456789' },
          },
          createdAt: new Date('2025-01-20T10:30:00Z'),
        },
      ],
    });

    const { GET } = await import('@/app/api/billing/history/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    const serializedEntry = JSON.stringify(data.entries[0]);

    expect(serializedEntry).not.toMatch(/cus_/);
    expect(serializedEntry).not.toMatch(/sub_/);
    expect(serializedEntry).not.toMatch(/evt_/);

    expect(serializedEntry).not.toContain('internalNotes');
    expect(serializedEntry).not.toContain('sensitive-note');
    expect(serializedEntry).not.toContain('rawPayload');

    expect(data.entries[0]).not.toHaveProperty('id');
    expect(data.entries[0]).not.toHaveProperty('previousState');
    expect(data.entries[0]).not.toHaveProperty('newState');
    expect(data.entries[0]).not.toHaveProperty('metadata');
    expect(data.entries[0]).not.toHaveProperty('rawPayload');
    expect(data.entries[0]).not.toHaveProperty('internalNotes');
  });

  it('returns empty entries when getUserBillingInfo fails', async () => {
    mockGetUserBillingInfo.mockResolvedValue({ success: false });

    const { GET } = await import('@/app/api/billing/history/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([]);
  });

  it('returns empty entries when getBillingAuditLog fails', async () => {
    mockGetBillingAuditLog.mockResolvedValue({ success: false });

    const { GET } = await import('@/app/api/billing/history/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toEqual([]);
  });
});
