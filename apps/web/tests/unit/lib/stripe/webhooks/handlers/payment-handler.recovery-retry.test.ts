/**
 * Payment recovery email must survive billing duplicate_event retries and
 * analytics failures after the entitlement commit (invoice-keyed idempotency).
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrackServerEvent = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  }))
);

const {
  mockStripeSubscriptionsRetrieve,
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  mockGetPlanFromPriceId,
  mockSendPaymentRecoveredEmail,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockGetPlanFromPriceId: vi.fn(),
  mockSendPaymentRecoveredEmail: vi.fn(),
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
  trackServerEventTx: vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  })),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: { retrieve: mockStripeSubscriptionsRetrieve },
  },
}));

vi.mock('@/lib/stripe/webhooks/utils', () => ({
  getUserIdFromStripeCustomer: vi.fn(),
  invalidateBillingCache: mockInvalidateBillingCache,
  isActiveSubscription: (status: string) =>
    status === 'active' || status === 'trialing',
  getCustomerId: (customer: string | { id: string } | null) => {
    if (!customer) return null;
    return typeof customer === 'string' ? customer : customer.id;
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));

vi.mock('@/lib/referrals/service', () => ({
  recordCommission: vi.fn(),
}));

vi.mock('@/lib/stripe/dunning', () => ({
  sendPaymentFailedEmail: vi.fn(),
  sendPaymentRecoveredEmail: mockSendPaymentRecoveredEmail,
  shouldSendDunningEmail: vi.fn(() => false),
}));

import { PaymentHandler } from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

const WEBHOOK_UNIX_SEC = 1_700_000_000;

function recoveryInvoiceContext(
  overrides: { eventId?: string; invoiceId?: string } = {}
): WebhookContext {
  const eventId = overrides.eventId ?? 'evt_recovery_retry';
  const invoiceId = overrides.invoiceId ?? 'in_recovery_retry';
  return {
    event: {
      id: eventId,
      type: 'invoice.payment_succeeded',
      created: WEBHOOK_UNIX_SEC,
      data: {
        object: {
          id: invoiceId,
          amount_paid: 2999,
          amount_due: 2999,
          currency: 'usd',
          attempt_count: 3,
          period_start: WEBHOOK_UNIX_SEC,
          period_end: WEBHOOK_UNIX_SEC + 2_592_000,
          parent: {
            subscription_details: { subscription: 'sub_recovery_retry' },
          },
        } as unknown as Stripe.Invoice,
      },
    } as Stripe.Event,
    stripeEventId: eventId,
    stripeEventTimestamp: new Date(WEBHOOK_UNIX_SEC * 1000),
  };
}

describe('PaymentHandler recovery email retries', () => {
  let handler: PaymentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PaymentHandler();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockInvalidateBillingCache.mockResolvedValue(undefined);
    mockSendPaymentRecoveredEmail.mockResolvedValue({ success: true });
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_recovery_retry',
      status: 'active',
      customer: 'cus_recovery',
      metadata: { clerk_user_id: 'user_recovery' },
      items: { data: [{ price: { id: 'price_pro' } }] },
    } as unknown as Stripe.Subscription);
  });

  it('sends recovery before analytics and still sends on duplicate_event retry', async () => {
    mockUpdateUserBillingStatus
      .mockResolvedValueOnce({
        success: true,
        appUserId: 'app_user_recovery',
        skipped: false,
      })
      .mockResolvedValueOnce({
        success: true,
        appUserId: 'app_user_recovery',
        skipped: true,
        skipReason: 'duplicate_event',
        reason: 'Stripe event already applied',
      });

    mockTrackServerEvent.mockRejectedValueOnce(
      new Error('analytics delivery failed')
    );

    const ctx = recoveryInvoiceContext();
    await expect(handler.handle(ctx)).rejects.toThrow(
      'analytics delivery failed'
    );

    expect(mockSendPaymentRecoveredEmail).toHaveBeenCalledWith({
      userId: 'app_user_recovery',
      amountPaid: 2999,
      currency: 'usd',
      priceId: 'price_pro',
      invoiceId: 'in_recovery_retry',
    });

    const retry = await handler.handle(ctx);
    expect(retry.success).toBe(true);
    expect(mockSendPaymentRecoveredEmail).toHaveBeenCalledTimes(2);
    expect(
      mockSendPaymentRecoveredEmail.mock.invocationCallOrder[0]
    ).toBeLessThan(mockTrackServerEvent.mock.invocationCallOrder[0]);
  });
});
