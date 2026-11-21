/**
 * Closed-loop: out-of-order invoice.payment_succeeded with stale_event still
 * records invoice-keyed referral commission; analytics stay gated.
 */
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
  mockRecordCommission,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockGetPlanFromPriceId: vi.fn(),
  mockRecordCommission: vi.fn(),
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
  recordCommission: mockRecordCommission,
}));

vi.mock('@/lib/stripe/dunning', () => ({
  sendPaymentFailedEmail: vi.fn(),
  sendPaymentRecoveredEmail: vi.fn(),
  shouldSendDunningEmail: vi.fn(() => false),
}));

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentHandler } from '@/lib/stripe/webhooks/handlers/payment-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

const WEBHOOK_UNIX_SEC = 1_700_000_000;

function paidInvoiceContext(
  overrides: {
    eventId?: string;
    invoiceId?: string;
    subscriptionId?: string;
  } = {}
): WebhookContext {
  const eventId = overrides.eventId ?? 'evt_stale_pay';
  const invoiceId = overrides.invoiceId ?? 'in_stale_pay';
  const subscriptionId = overrides.subscriptionId ?? 'sub_stale_pay';
  return {
    event: {
      id: eventId,
      type: 'invoice.payment_succeeded',
      created: WEBHOOK_UNIX_SEC,
      data: {
        object: {
          id: invoiceId,
          amount_paid: 1999,
          amount_due: 1999,
          currency: 'usd',
          attempt_count: 1,
          period_start: WEBHOOK_UNIX_SEC,
          period_end: WEBHOOK_UNIX_SEC + 2_592_000,
          parent: {
            subscription_details: { subscription: subscriptionId },
          },
        } as unknown as Stripe.Invoice,
      },
    } as Stripe.Event,
    stripeEventId: eventId,
    stripeEventTimestamp: new Date(WEBHOOK_UNIX_SEC * 1000),
  };
}

describe('PaymentHandler stale invoice commission', () => {
  let handler: PaymentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PaymentHandler();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockInvalidateBillingCache.mockResolvedValue(undefined);
    mockRecordCommission.mockResolvedValue(undefined);
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_stale_pay',
      status: 'active',
      customer: 'cus_stale_pay',
      metadata: { clerk_user_id: 'user_stale_pay' },
      items: { data: [{ price: { id: 'price_pro' } }] },
    } as unknown as Stripe.Subscription);
  });

  it('records invoice-keyed commission on stale_event without payment analytics', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'stale_event',
      skipReason: 'stale_event',
      appUserId: 'app_user_stale_pay',
    });

    const result = await handler.handle(paidInvoiceContext());

    expect(result).toMatchObject({
      success: true,
      skipped: true,
      reason: 'stale_event',
    });
    expect(mockRecordCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        referredUserId: 'app_user_stale_pay',
        stripeInvoiceId: 'in_stale_pay',
        paymentAmountCents: 1999,
      })
    );
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });

  it('does not record commission on subscription_mismatch skips', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'subscription_mismatch',
      skipReason: 'subscription_mismatch',
      appUserId: 'app_user_mismatch_pay',
    });

    await handler.handle(
      paidInvoiceContext({
        eventId: 'evt_mismatch_pay',
        invoiceId: 'in_mismatch_pay',
        subscriptionId: 'sub_mismatch_pay',
      })
    );

    expect(mockRecordCommission).not.toHaveBeenCalled();
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
  });
});
