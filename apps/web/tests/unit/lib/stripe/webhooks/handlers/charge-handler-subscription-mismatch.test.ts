/**
 * Refund/dispute on a superseded subscription: entitlements skip (mismatch) but
 * the charge's Stripe subscription must still be canceled.
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStripeSubscriptionsRetrieve,
  mockStripeSubscriptionsCancel,
  mockStripeInvoicesRetrieve,
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  mockExpireReferralOnChurn,
  mockReverseReferralCommission,
  mockSendSlackMessage,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockStripeSubscriptionsCancel: vi.fn(),
  mockStripeInvoicesRetrieve: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockExpireReferralOnChurn: vi.fn(),
  mockReverseReferralCommission: vi.fn(),
  mockSendSlackMessage: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      cancel: mockStripeSubscriptionsCancel,
    },
    invoices: { retrieve: mockStripeInvoicesRetrieve },
    charges: { retrieve: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
    invoicePayments: { list: vi.fn() },
  },
}));
vi.mock('@/lib/stripe/webhooks/utils', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/stripe/webhooks/utils')
  >('@/lib/stripe/webhooks/utils');
  return { ...actual, invalidateBillingCache: mockInvalidateBillingCache };
});
vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  logFallback: vi.fn(),
}));
vi.mock('@/lib/referrals/service', () => ({
  expireReferralOnChurn: mockExpireReferralOnChurn,
  reverseReferralCommission: mockReverseReferralCommission,
}));
vi.mock('@/lib/notifications/providers/slack', () => ({
  sendSlackMessage: mockSendSlackMessage,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ChargeHandler } from '@/lib/stripe/webhooks/handlers/charge-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

function refundContext(): WebhookContext {
  const charge = {
    id: 'ch_mismatch',
    refunded: true,
    amount: 1999,
    amount_refunded: 1999,
    customer: 'cus_123',
    payment_intent: 'pi_123',
    invoice: 'in_latest',
  } as unknown as Stripe.Charge;
  return {
    event: {
      id: 'evt_mismatch',
      type: 'charge.refunded',
      created: Math.floor(Date.now() / 1000),
      data: { object: charge },
    } as Stripe.Event,
    stripeEventId: 'evt_mismatch',
    stripeEventTimestamp: new Date(),
  };
}

describe('ChargeHandler subscription_mismatch skip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeInvoicesRetrieve.mockResolvedValue({
      id: 'in_latest',
      parent: { subscription_details: { subscription: 'sub_old' } },
    });
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_old',
      status: 'active',
      customer: 'cus_123',
      latest_invoice: 'in_latest',
      metadata: { clerk_user_id: 'user_abc' },
    });
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      skipReason: 'subscription_mismatch',
      reason: 'Active subscription replaced before downgrade',
      appUserId: 'app_user_123',
    });
    mockReverseReferralCommission.mockResolvedValue(undefined);
    mockSendSlackMessage.mockResolvedValue({ status: 'sent' });
    mockStripeSubscriptionsCancel.mockResolvedValue({ status: 'canceled' });
  });

  it('cancels the charge subscription without churn side effects', async () => {
    const handler = new ChargeHandler();
    const result = await handler.handle(refundContext());

    expect(result).toEqual({
      success: true,
      skipped: true,
      reason: 'Active subscription replaced before downgrade',
    });
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_old');
    expect(mockExpireReferralOnChurn).not.toHaveBeenCalled();
    expect(mockInvalidateBillingCache).not.toHaveBeenCalled();
  });
});
