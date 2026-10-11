/**
 * Checkout Session Expired Handler Tests
 *
 * Tests for the CheckoutSessionExpiredHandler which processes
 * checkout.session.expired webhook events and records the
 * `checkout_abandoned` lead funnel event as the recovery touchpoint.
 */

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAttributeLeadCheckoutAbandonment,
  mockGetCustomerId,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockAttributeLeadCheckoutAbandonment: vi.fn(),
  mockGetCustomerId: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  attributeLeadCheckoutAbandonment: mockAttributeLeadCheckoutAbandonment,
}));

// Registry imports the full handler graph; stub modules with load-time
// side effects so importing the registry is safe in unit tests.
vi.mock('@/lib/stripe/client', () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));

vi.mock('@/lib/db', () => ({ db: {} }));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  captureError: vi.fn(),
  logFallback: vi.fn(),
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: vi.fn(),
}));

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: vi.fn(),
}));

vi.mock('@/lib/email/paid-welcome', () => ({
  enqueuePaidWelcomeAfterEntitlement: vi.fn(),
  maybeSendPaidWelcomeAfterEntitlement: vi.fn(),
}));

vi.mock('@/lib/referrals/service', () => ({
  activateReferral: vi.fn(),
}));

vi.mock('@/lib/stripe/webhooks/utils', () => ({
  getCustomerId: mockGetCustomerId,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: vi.fn(),
  },
}));

import {
  CheckoutSessionExpiredHandler,
  checkoutSessionExpiredHandler,
} from '@/lib/stripe/webhooks/handlers/checkout-expired-handler';
import { getHandler } from '@/lib/stripe/webhooks/registry';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';

function buildContext(
  session: Partial<Stripe.Checkout.Session>
): WebhookContext {
  return {
    event: {
      id: 'evt_expired_123',
      type: 'checkout.session.expired',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_test_expired',
          ...session,
        } as unknown as Stripe.Checkout.Session,
      },
    } as Stripe.Event,
    stripeEventId: 'evt_expired_123',
    stripeEventTimestamp: new Date(),
  };
}

describe('CheckoutSessionExpiredHandler', () => {
  let handler: CheckoutSessionExpiredHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CheckoutSessionExpiredHandler();
    mockGetCustomerId.mockImplementation(
      (customer: string | { id: string } | null) => {
        if (!customer) return null;
        return typeof customer === 'string' ? customer : customer.id;
      }
    );
    mockAttributeLeadCheckoutAbandonment.mockResolvedValue({
      recorded: true,
    });
  });

  describe('eventTypes and registration', () => {
    it('handles checkout.session.expired event type', () => {
      expect(handler.eventTypes).toContain('checkout.session.expired');
      expect(handler.eventTypes).toHaveLength(1);
    });

    it('is registered in the webhook handler registry', () => {
      expect(getHandler('checkout.session.expired')).toBe(
        checkoutSessionExpiredHandler
      );
    });
  });

  describe('handle', () => {
    it('records the abandonment with session identity and correlation', async () => {
      const context = buildContext({
        customer: 'cus_123',
        metadata: {
          clerk_user_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          run_id: 'run_1',
        },
      });

      const result = await handler.handle(context);

      expect(mockAttributeLeadCheckoutAbandonment).toHaveBeenCalledWith({
        userIdentity: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        stripeCustomerId: 'cus_123',
        stripeSessionId: 'cs_test_expired',
        correlation: expect.objectContaining({ runId: 'run_1' }),
      });
      expect(result).toEqual({ success: true });
    });

    it('passes null customer through for anonymous sessions', async () => {
      mockAttributeLeadCheckoutAbandonment.mockResolvedValue({
        recorded: false,
        reason: 'unidentified_checkout_session',
      });

      const result = await handler.handle(buildContext({ customer: null }));

      expect(mockAttributeLeadCheckoutAbandonment).toHaveBeenCalledWith(
        expect.objectContaining({
          userIdentity: undefined,
          stripeCustomerId: null,
        })
      );
      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'unidentified_checkout_session',
      });
    });

    it('skips when no lead is attributed to the user', async () => {
      mockAttributeLeadCheckoutAbandonment.mockResolvedValue({
        recorded: false,
        reason: 'no_attributed_lead',
      });

      const result = await handler.handle(
        buildContext({ metadata: { clerk_user_id: 'user_123' } })
      );

      expect(result).toEqual({
        success: true,
        skipped: true,
        reason: 'no_attributed_lead',
      });
    });

    it('propagates funnel write failures so Stripe retries', async () => {
      mockAttributeLeadCheckoutAbandonment.mockRejectedValue(
        new Error('db down')
      );

      await expect(
        handler.handle(buildContext({ metadata: { clerk_user_id: 'u' } }))
      ).rejects.toThrow('db down');
    });
  });
});
