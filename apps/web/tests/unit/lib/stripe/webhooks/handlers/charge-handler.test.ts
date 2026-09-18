/**
 * Charge Handler Tests
 *
 * Refunds and disputes on subscription charges must revoke Pro. One-time
 * charges, partial refunds, and historical goodwill refunds must not.
 */

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStripeSubscriptionsRetrieve,
  mockStripeSubscriptionsCancel,
  mockStripeInvoicesRetrieve,
  mockStripeChargesRetrieve,
  mockGetUserIdFromStripeCustomer,
  mockInvalidateBillingCache,
  mockUpdateUserBillingStatus,
  mockCaptureCriticalError,
  mockLogFallback,
  mockExpireReferralOnChurn,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockStripeSubscriptionsRetrieve: vi.fn(),
  mockStripeSubscriptionsCancel: vi.fn(),
  mockStripeInvoicesRetrieve: vi.fn(),
  mockStripeChargesRetrieve: vi.fn(),
  mockGetUserIdFromStripeCustomer: vi.fn(),
  mockInvalidateBillingCache: vi.fn(),
  mockUpdateUserBillingStatus: vi.fn(),
  mockCaptureCriticalError: vi.fn(),
  mockLogFallback: vi.fn(),
  mockExpireReferralOnChurn: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      cancel: mockStripeSubscriptionsCancel,
    },
    invoices: {
      retrieve: mockStripeInvoicesRetrieve,
    },
    charges: {
      retrieve: mockStripeChargesRetrieve,
    },
  },
}));

vi.mock('@/lib/stripe/webhooks/utils', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/stripe/webhooks/utils')
  >('@/lib/stripe/webhooks/utils');
  return {
    ...actual,
    getUserIdFromStripeCustomer: mockGetUserIdFromStripeCustomer,
    invalidateBillingCache: mockInvalidateBillingCache,
  };
});

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  logFallback: mockLogFallback,
}));

vi.mock('@/lib/referrals/service', () => ({
  expireReferralOnChurn: mockExpireReferralOnChurn,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  ChargeHandler,
  chargeHandler,
} from '@/lib/stripe/webhooks/handlers/charge-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import { isSupportedEventType } from '@/lib/stripe/webhooks/types';

function subscriptionInvoice(id = 'in_latest'): Stripe.Invoice {
  return {
    id,
    parent: {
      subscription_details: { subscription: 'sub_123' },
    },
  } as Stripe.Invoice;
}

function activeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: 'sub_123',
    status: 'active',
    customer: 'cus_123',
    latest_invoice: 'in_latest',
    metadata: { clerk_user_id: 'user_abc' },
    items: { data: [{ price: { id: 'price_pro' } }] },
    ...overrides,
  } as Stripe.Subscription;
}

function refundedCharge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: 'ch_123',
    refunded: true,
    amount: 1999,
    amount_refunded: 1999,
    customer: 'cus_123',
    invoice: 'in_latest',
    ...overrides,
  } as Stripe.Charge;
}

function refundContext(
  charge: Stripe.Charge,
  eventId = 'evt_refund'
): WebhookContext {
  return {
    event: {
      id: eventId,
      type: 'charge.refunded',
      created: Math.floor(Date.now() / 1000),
      data: { object: charge },
    } as Stripe.Event,
    stripeEventId: eventId,
    stripeEventTimestamp: new Date(),
  };
}

function disputeContext(
  dispute: Partial<Stripe.Dispute> = {},
  eventId = 'evt_dispute'
): WebhookContext {
  return {
    event: {
      id: eventId,
      type: 'charge.dispute.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'dp_123',
          charge: 'ch_123',
          status: 'needs_response',
          ...dispute,
        } as Stripe.Dispute,
      },
    } as Stripe.Event,
    stripeEventId: eventId,
    stripeEventTimestamp: new Date(),
  };
}

describe('@critical ChargeHandler', () => {
  let handler: ChargeHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ChargeHandler();

    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      appUserId: 'app_user_123',
    });
    mockInvalidateBillingCache.mockResolvedValue(undefined);
    mockExpireReferralOnChurn.mockResolvedValue(undefined);
    mockStripeSubscriptionsCancel.mockResolvedValue({
      id: 'sub_123',
      status: 'canceled',
    });
    mockStripeInvoicesRetrieve.mockResolvedValue(subscriptionInvoice());
    mockStripeSubscriptionsRetrieve.mockResolvedValue(activeSubscription());
    mockStripeChargesRetrieve.mockResolvedValue(refundedCharge());
    mockCaptureCriticalError.mockResolvedValue(undefined);
  });

  describe('eventTypes', () => {
    it('handles charge.refunded and charge.dispute.created', () => {
      expect(handler.eventTypes).toContain('charge.refunded');
      expect(handler.eventTypes).toContain('charge.dispute.created');
      expect(handler.eventTypes).toHaveLength(2);
      expect(isSupportedEventType('charge.refunded')).toBe(true);
      expect(isSupportedEventType('charge.dispute.created')).toBe(true);
      expect(chargeHandler.eventTypes).toEqual(handler.eventTypes);
    });
  });

  describe('charge.refunded', () => {
    it('revokes Pro and cancels the live subscription for a full current-invoice refund', async () => {
      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result).toEqual({ success: true });
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_abc',
          isPro: false,
          stripeSubscriptionId: null,
          eventType: 'charge_refunded',
          metadata: expect.objectContaining({
            invoiceId: 'in_latest',
            chargeId: 'ch_123',
          }),
        })
      );
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_123');
      expect(mockExpireReferralOnChurn).toHaveBeenCalledWith('app_user_123');
      expect(mockInvalidateBillingCache).toHaveBeenCalledWith('app_user_123');
    });

    it('is safe to replay: a second identical refund still revokes and cancels', async () => {
      const context = refundContext(refundedCharge(), 'evt_refund_replay');

      const first = await handler.handle(context);
      const second = await handler.handle(context);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledTimes(2);
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledTimes(2);
    });

    it('skips partial refunds without touching billing', async () => {
      const result = await handler.handle(
        refundContext(
          refundedCharge({
            refunded: false,
            amount_refunded: 500,
          })
        )
      );

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'partial_refund',
      });
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it('skips one-time charges that have no invoice', async () => {
      const result = await handler.handle(
        refundContext(refundedCharge({ invoice: null }))
      );

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'charge_has_no_invoice',
      });
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('skips invoices that are not subscription invoices', async () => {
      mockStripeInvoicesRetrieve.mockResolvedValue({ id: 'in_one_time' });

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'invoice_has_no_subscription',
      });
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('skips historical goodwill refunds of older invoices', async () => {
      mockStripeInvoicesRetrieve.mockResolvedValue(
        subscriptionInvoice('in_old')
      );

      const result = await handler.handle(
        refundContext(refundedCharge({ invoice: 'in_old' }))
      );

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'historical_invoice_refund',
      });
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it('falls back to customer lookup when subscription metadata is missing', async () => {
      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        activeSubscription({ metadata: {} })
      );
      mockGetUserIdFromStripeCustomer.mockResolvedValue('user_from_db');

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result.success).toBe(true);
      expect(mockLogFallback).toHaveBeenCalled();
      expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith('cus_123');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ clerkUserId: 'user_from_db', isPro: false })
      );
    });

    it('skips when the user cannot be identified', async () => {
      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        activeSubscription({ metadata: {}, customer: 'cus_unknown' })
      );
      mockGetUserIdFromStripeCustomer.mockResolvedValue(null);

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'cannot_identify_user_for_charge_reversal',
      });
      expect(mockCaptureCriticalError).toHaveBeenCalled();
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('does not cancel Stripe when the billing update is a stale-event skip', async () => {
      mockUpdateUserBillingStatus.mockResolvedValue({
        success: true,
        skipped: true,
        reason: 'Event is older than last processed event',
        appUserId: 'app_user_123',
      });

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'Event is older than last processed event',
      });
      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it('throws when billing update fails so Stripe can retry', async () => {
      mockUpdateUserBillingStatus.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      await expect(
        handler.handle(refundContext(refundedCharge()))
      ).rejects.toThrow('Failed to downgrade user: Database error');
      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it('does not cancel a subscription that is already canceled', async () => {
      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        activeSubscription({ status: 'canceled' })
      );

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it('treats an already-canceled Stripe error as idempotent success', async () => {
      mockStripeSubscriptionsCancel.mockRejectedValue({
        code: 'resource_missing',
        message: 'No such subscription: sub_123',
      });

      const result = await handler.handle(refundContext(refundedCharge()));

      expect(result.success).toBe(true);
    });

    it('rethrows unexpected Stripe cancel failures after revoke', async () => {
      mockStripeSubscriptionsCancel.mockRejectedValue(
        new Error('stripe timeout')
      );

      await expect(
        handler.handle(refundContext(refundedCharge()))
      ).rejects.toThrow('stripe timeout');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalled();
    });

    it('uses an expanded invoice on the charge without retrieving it', async () => {
      const result = await handler.handle(
        refundContext(
          refundedCharge({
            invoice:
              subscriptionInvoice() as unknown as Stripe.Charge['invoice'],
          })
        )
      );

      expect(result.success).toBe(true);
      expect(mockStripeInvoicesRetrieve).not.toHaveBeenCalled();
    });

    it('skips unhandled event types', async () => {
      const result = await handler.handle({
        event: {
          id: 'evt_other',
          type: 'invoice.payment_succeeded',
          data: { object: refundedCharge() },
        } as Stripe.Event,
        stripeEventId: 'evt_other',
        stripeEventTimestamp: new Date(),
      });

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'unhandled_event_type',
      });
    });
  });

  describe('charge.dispute.created', () => {
    it('revokes Pro for a subscription chargeback', async () => {
      const result = await handler.handle(disputeContext());

      expect(result).toEqual({ success: true });
      expect(mockStripeChargesRetrieve).toHaveBeenCalledWith('ch_123');
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          clerkUserId: 'user_abc',
          isPro: false,
          eventType: 'charge_disputed',
          metadata: expect.objectContaining({
            disputeId: 'dp_123',
            disputeStatus: 'needs_response',
          }),
        })
      );
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith('sub_123');
    });

    it('revokes even when the disputed invoice is historical', async () => {
      mockStripeInvoicesRetrieve.mockResolvedValue(
        subscriptionInvoice('in_old')
      );
      mockStripeChargesRetrieve.mockResolvedValue(
        refundedCharge({ invoice: 'in_old' })
      );

      const result = await handler.handle(disputeContext());

      expect(result.success).toBe(true);
      expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'charge_disputed', isPro: false })
      );
    });

    it('uses an expanded charge on the dispute without retrieving it', async () => {
      const result = await handler.handle(
        disputeContext({
          charge: refundedCharge(),
        })
      );

      expect(result.success).toBe(true);
      expect(mockStripeChargesRetrieve).not.toHaveBeenCalled();
    });

    it('skips disputes with no charge id', async () => {
      const result = await handler.handle(
        disputeContext({ charge: '' as unknown as string })
      );

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'dispute_has_no_charge',
      });
      expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
    });

    it('is safe to replay a dispute event', async () => {
      const context = disputeContext({}, 'evt_dispute_replay');

      await handler.handle(context);
      await handler.handle(context);

      expect(mockUpdateUserBillingStatus).toHaveBeenCalledTimes(2);
      expect(mockStripeSubscriptionsCancel).toHaveBeenCalledTimes(2);
    });
  });
});
