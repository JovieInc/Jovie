/**
 * Property-based tests for billing state transitions.
 *
 * Locks the state laws the webhook + reconciliation surfaces depend on:
 * - the Pro-grant predicate is identical in the resolver and the webhook
 *   utils (they must never drift apart on any subscription status)
 * - Pro is granted exactly for active/trialing and revoked for every other
 *   Stripe status
 * - detectStatusMismatch flags a mismatch exactly when DB and Stripe
 *   disagree, and always reports the Stripe-derived expectation
 * - customer-id extraction agrees across modules and fails closed
 * - canAutomaticallyCreateLinks fails closed unless every prerequisite and
 *   the exact documented offer are present
 */

import fc from 'fast-check';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockDb, mockCaptureWarning, mockGetRedis, mockGetPriceMappingDetails } =
  vi.hoisted(() => ({
    mockDb: { select: vi.fn() },
    mockCaptureWarning: vi.fn(),
    mockGetRedis: vi.fn(),
    mockGetPriceMappingDetails: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
  captureError: vi.fn(),
  captureCriticalError: vi.fn(),
}));
vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: mockGetPriceMappingDetails,
}));

import {
  detectStatusMismatch,
  extractCustomerId,
  shouldGrantProAccess,
} from '@/lib/billing/reconciliation/subscription-status-resolver';
import { canAutomaticallyCreateLinks } from '@/lib/entitlements/automatic-links';
import {
  extractStripeObjectId,
  getCustomerId,
  isActiveSubscription,
  isFullyRefundedCharge,
  isLatestSubscriptionInvoice,
  stripeTimestampToDate,
} from '@/lib/stripe/webhooks/utils';

const SUBSCRIPTION_STATUSES = [
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'paused',
] as const satisfies readonly Stripe.Subscription.Status[];

const statusArb = fc.constantFrom(...SUBSCRIPTION_STATUSES);

const customerIdArb = fc.oneof(
  fc.stringMatching(/^cus_[a-zA-Z0-9]{1,20}$/),
  fc.record({ id: fc.stringMatching(/^cus_[a-zA-Z0-9]{1,20}$/) }),
  fc.constant(null)
);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue(null);
});

describe('Pro-grant predicate (property)', () => {
  it('resolver and webhook utils agree on every subscription status', () => {
    fc.assert(
      fc.property(statusArb, status => {
        expect(shouldGrantProAccess(status)).toBe(isActiveSubscription(status));
      })
    );
  });

  it('grants Pro exactly for active and trialing subscriptions', () => {
    fc.assert(
      fc.property(statusArb, status => {
        const expected = status === 'active' || status === 'trialing';
        expect(shouldGrantProAccess(status)).toBe(expected);
        expect(isActiveSubscription(status)).toBe(expected);
      })
    );
  });
});

describe('detectStatusMismatch (property)', () => {
  it('flags a mismatch exactly when DB disagrees with Stripe', () => {
    fc.assert(
      fc.property(fc.boolean(), statusArb, (dbIsPro, status) => {
        const subscription = { status } as Stripe.Subscription;
        const result = detectStatusMismatch(dbIsPro, subscription);
        const expectedIsPro = shouldGrantProAccess(status);
        expect(result.expectedIsPro).toBe(expectedIsPro);
        expect(result.hasMismatch).toBe(dbIsPro !== expectedIsPro);
        if (!result.hasMismatch) {
          expect(result.reason).toBe('status_matches');
        } else {
          expect(result.reason).toContain(String(dbIsPro));
          expect(result.reason).toContain(status);
        }
      })
    );
  });
});

describe('customer-id extraction (property)', () => {
  it('agrees across modules and fails closed', () => {
    fc.assert(
      fc.property(customerIdArb, raw => {
        const customer = raw as unknown as Parameters<typeof getCustomerId>[0];
        expect(getCustomerId(customer)).toBe(extractCustomerId(customer));
        if (typeof customer === 'string') {
          expect(extractCustomerId(customer)).toBe(customer);
        } else if (customer && typeof customer === 'object') {
          expect(extractCustomerId(customer)).toBe(customer.id);
        } else {
          expect(extractCustomerId(customer)).toBeNull();
        }
      })
    );
  });
});

describe('refund state transitions (property)', () => {
  it('flags exactly the Stripe refunded flag or a full-amount refund', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.constantFrom(-1, 0, 1),
        fc.boolean(),
        (amountBase, delta, refunded) => {
          const amount = amountBase + 1;
          const amountRefunded = Math.max(0, amount + delta);
          expect(
            isFullyRefundedCharge({
              refunded,
              amount,
              amount_refunded: amountRefunded,
            })
          ).toBe(refunded || amountRefunded >= amount);
        }
      )
    );
  });

  it('partial refunds strictly below the original amount stay paid', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (amountBase, partialBase) => {
          const amount = amountBase + 1;
          const partial = partialBase % amount;
          expect(
            isFullyRefundedCharge({
              refunded: false,
              amount,
              amount_refunded: partial,
            })
          ).toBe(false);
        }
      )
    );
  });

  it('a zero-amount charge is never refunded on amount evidence alone', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), amountRefunded => {
        expect(
          isFullyRefundedCharge({
            refunded: false,
            amount: 0,
            amount_refunded: amountRefunded,
          })
        ).toBe(false);
      })
    );
  });

  it('converts Stripe second timestamps to exact millisecond dates', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2_000_000_000 }), ts => {
        expect(stripeTimestampToDate(ts).getTime()).toBe(ts * 1000);
      })
    );
    expect(stripeTimestampToDate(0).getTime()).toBe(0);
  });

  it('treats an invoice as latest only on exact id equality', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^in_[a-zA-Z0-9]{1,20}$/),
        fc.stringMatching(/^in_[a-zA-Z0-9]{1,20}$/),
        (latestId, invoiceId) => {
          expect(
            isLatestSubscriptionInvoice(
              { id: invoiceId },
              { latest_invoice: latestId }
            )
          ).toBe(latestId === invoiceId);
        }
      )
    );
    expect(
      isLatestSubscriptionInvoice({ id: 'in_x' }, { latest_invoice: null })
    ).toBe(false);
  });

  it('extracts object ids from strings and id-bearing objects, null-closed otherwise', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]+_[a-zA-Z0-9]{1,20}$/), id => {
        expect(extractStripeObjectId(id)).toBe(id);
        expect(extractStripeObjectId({ id })).toBe(id);
        expect(extractStripeObjectId(null)).toBeNull();
        expect(extractStripeObjectId('')).toBeNull();
      })
    );
  });
});

describe('canAutomaticallyCreateLinks (property)', () => {
  const mappingArb = fc.record({
    legacy: fc.boolean(),
    offerCapabilities: fc.option(
      fc.record({ canAutoCreateLinks: fc.boolean() }),
      { nil: undefined }
    ),
  });

  const billingArb = fc.record({
    isPro: fc.option(fc.boolean(), { nil: null }),
    plan: fc.option(fc.stringMatching(/^[a-z]{1,10}$/), { nil: null }),
    stripeSubscriptionId: fc.option(
      fc.stringMatching(/^sub_[a-zA-Z0-9]{1,20}$/),
      { nil: null }
    ),
    stripePriceId: fc.option(fc.stringMatching(/^price_[a-zA-Z0-9_]{1,20}$/), {
      nil: null,
    }),
  });

  it('fails closed whenever any prerequisite is missing', () => {
    fc.assert(
      fc.property(billingArb, billing => {
        const missing =
          billing.isPro !== true ||
          billing.plan !== 'pro' ||
          !billing.stripeSubscriptionId ||
          !billing.stripePriceId;
        if (missing) {
          expect(canAutomaticallyCreateLinks(billing)).toBe(false);
        }
      })
    );
  });

  it('grants exactly when all prerequisites hold and the exact offer grants it', () => {
    fc.assert(
      fc.property(billingArb, mappingArb, (billing, mapping) => {
        mockGetPriceMappingDetails.mockReturnValue(
          billing.stripePriceId ? ({ ...mapping } as never) : undefined
        );
        const prerequisitesSatisfied =
          billing.isPro === true &&
          billing.plan === 'pro' &&
          Boolean(billing.stripeSubscriptionId) &&
          Boolean(billing.stripePriceId);
        const offerGrants =
          mapping.legacy !== true &&
          mapping.offerCapabilities?.canAutoCreateLinks === true;
        expect(canAutomaticallyCreateLinks(billing)).toBe(
          prerequisitesSatisfied && offerGrants
        );
      })
    );
  });

  it('a granted capability always implicates the exact active offer', () => {
    fc.assert(
      fc.property(billingArb, mappingArb, (billing, mapping) => {
        mockGetPriceMappingDetails.mockReturnValue(
          billing.stripePriceId ? ({ ...mapping } as never) : undefined
        );
        if (canAutomaticallyCreateLinks(billing)) {
          expect(billing.isPro).toBe(true);
          expect(billing.plan).toBe('pro');
          expect(billing.stripeSubscriptionId).toBeTruthy();
          expect(billing.stripePriceId).toBeTruthy();
          expect(mapping.legacy).not.toBe(true);
          expect(mapping.offerCapabilities?.canAutoCreateLinks).toBe(true);
        }
      })
    );
  });
});
