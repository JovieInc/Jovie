/**
 * Property tests for merch webhook routing / claim-interval decisions.
 *
 * Mutation score on app/api/webhooks/stripe-merch/route.ts sat at 39.4% with
 * example-only mocked coverage. These invariants must hold for every event
 * type Stripe can deliver — not only the four hand-picked cases in the route
 * suite.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  isMerchProcessingClaimStale,
  MERCH_STALE_PROCESSING_CLAIM_MS,
  resolveMerchWebhookAction,
} from './merch-event-routing';

const CHECKOUT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
] as const;

describe('resolveMerchWebhookAction properties', () => {
  it('maps both checkout-success types to checkout_completed', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CHECKOUT_TYPES), type => {
        expect(resolveMerchWebhookAction(type)).toBe('checkout_completed');
      }),
      { numRuns: 40 }
    );
  });

  it('maps async_payment_failed only to payment_failed', () => {
    expect(
      resolveMerchWebhookAction('checkout.session.async_payment_failed')
    ).toBe('payment_failed');
  });

  it('maps charge.refunded only to charge_refunded', () => {
    expect(resolveMerchWebhookAction('charge.refunded')).toBe(
      'charge_refunded'
    );
  });

  it('treats every other type as unhandled (fail closed on routing)', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 64 })
          .filter(
            s =>
              !CHECKOUT_TYPES.includes(s as (typeof CHECKOUT_TYPES)[number]) &&
              s !== 'checkout.session.async_payment_failed' &&
              s !== 'charge.refunded'
          ),
        type => {
          expect(resolveMerchWebhookAction(type)).toBe('unhandled');
        }
      ),
      { numRuns: 80 }
    );
  });
});

describe('isMerchProcessingClaimStale properties', () => {
  it('null/undefined start is always stealable', () => {
    fc.assert(
      fc.property(fc.date(), now => {
        expect(isMerchProcessingClaimStale(null, now)).toBe(true);
        expect(isMerchProcessingClaimStale(undefined, now)).toBe(true);
      }),
      { numRuns: 40 }
    );
  });

  it('fresh leases inside the claim interval are not stale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MERCH_STALE_PROCESSING_CLAIM_MS - 1 }),
        ageMs => {
          const now = new Date('2026-01-01T00:00:00.000Z');
          const started = new Date(now.getTime() - ageMs);
          expect(isMerchProcessingClaimStale(started, now)).toBe(false);
        }
      ),
      { numRuns: 60 }
    );
  });

  it('leases older than the claim interval are stale (strict < matches SQL)', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: MERCH_STALE_PROCESSING_CLAIM_MS + 1,
          max: MERCH_STALE_PROCESSING_CLAIM_MS * 4,
        }),
        ageMs => {
          const now = new Date('2026-01-01T00:00:00.000Z');
          const started = new Date(now.getTime() - ageMs);
          expect(isMerchProcessingClaimStale(started, now)).toBe(true);
        }
      ),
      { numRuns: 60 }
    );
  });

  it('lease exactly at the claim interval boundary is not stale', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const started = new Date(now.getTime() - MERCH_STALE_PROCESSING_CLAIM_MS);
    expect(isMerchProcessingClaimStale(started, now)).toBe(false);
  });

  it('negative or non-finite claim intervals never steal an existing lease', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const started = new Date(now.getTime() - 60_000);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.integer({ min: -10_000, max: -1 })
        ),
        claimIntervalMs => {
          expect(
            isMerchProcessingClaimStale(started, now, claimIntervalMs)
          ).toBe(false);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('zero-width interval still steals any prior start (not <= 0 early-return)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const started = new Date(now.getTime() - 1);
    expect(isMerchProcessingClaimStale(started, now, 0)).toBe(true);
    expect(isMerchProcessingClaimStale(now, now, 0)).toBe(false);
  });
});
