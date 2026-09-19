import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_CORRELATION_MAX_LENGTH,
  CheckoutCorrelationValidationError,
  checkoutCorrelationIdempotencyPart,
  extractCheckoutCorrelation,
  hasCheckoutCorrelation,
  mergeCheckoutCorrelation,
  parseCheckoutCorrelation,
  toCheckoutCorrelationReceiptFields,
  toStripeCheckoutCorrelationMetadata,
} from './checkout-correlation';

const correlation = {
  claimId: 'claim_abc',
  runId: 'run_def',
  candidateId: 'candidate_ghi',
  offerVersion: 'launch-acquisition:premade-artist-profile:v1',
  firstTouch: 'claim_invite',
} as const;

describe('parseCheckoutCorrelation', () => {
  it('returns empty correlation when optional fields are omitted', () => {
    expect(parseCheckoutCorrelation({ priceId: 'price_123' })).toEqual({});
    expect(parseCheckoutCorrelation(undefined)).toEqual({});
    expect(hasCheckoutCorrelation({})).toBe(false);
  });

  it('accepts camelCase and snake_case aliases used by existing types', () => {
    expect(
      parseCheckoutCorrelation({
        claimId: 'claim_abc',
        run_id: 'run_def',
        candidateId: 'candidate_ghi',
        offer_version: correlation.offerVersion,
        firstTouch: 'claim_invite',
      })
    ).toEqual(correlation);
  });

  it('treats blank strings as absent so legacy callers stay valid', () => {
    expect(
      parseCheckoutCorrelation({
        claimId: '  ',
        runId: '',
      })
    ).toEqual({});
  });

  it('rejects non-string or oversized correlation values', () => {
    expect(() => parseCheckoutCorrelation({ claimId: 12 })).toThrow(
      CheckoutCorrelationValidationError
    );
    expect(() =>
      parseCheckoutCorrelation({
        runId: 'r'.repeat(CHECKOUT_CORRELATION_MAX_LENGTH + 1),
      })
    ).toThrow(CheckoutCorrelationValidationError);
  });
});

describe('Stripe metadata round-trip', () => {
  it('writes snake_case Stripe keys and reads them back', () => {
    const metadata = toStripeCheckoutCorrelationMetadata(correlation);
    expect(metadata).toEqual({
      claim_id: 'claim_abc',
      run_id: 'run_def',
      candidate_id: 'candidate_ghi',
      offer_version: correlation.offerVersion,
      first_touch: 'claim_invite',
    });
    expect(extractCheckoutCorrelation(metadata)).toEqual(correlation);
  });

  it('prefers session metadata and fills gaps from subscription metadata', () => {
    expect(
      extractCheckoutCorrelation(
        { claim_id: 'session_claim', offer_version: 'offer_v2' },
        {
          claim_id: 'subscription_claim',
          run_id: 'sub_run',
          first_touch: 'onboarding',
        }
      )
    ).toEqual({
      claimId: 'session_claim',
      offerVersion: 'offer_v2',
      runId: 'sub_run',
      firstTouch: 'onboarding',
    });
  });

  it('omits empty Stripe metadata when no correlation is present', () => {
    expect(toStripeCheckoutCorrelationMetadata({})).toEqual({});
    expect(toStripeCheckoutCorrelationMetadata(undefined)).toEqual({});
  });
});

describe('receipt + idempotency helpers', () => {
  it('emits camelCase receipt fields for existing jsonb outcome tables', () => {
    expect(toCheckoutCorrelationReceiptFields(correlation)).toEqual(
      correlation
    );
    expect(toCheckoutCorrelationReceiptFields({})).toEqual({});
  });

  it('keeps a stable idempotency part only when correlation is present', () => {
    expect(checkoutCorrelationIdempotencyPart({})).toBeUndefined();
    const first = checkoutCorrelationIdempotencyPart(correlation);
    const second = checkoutCorrelationIdempotencyPart({ ...correlation });
    expect(first).toEqual(second);
    expect(first).toHaveLength(16);
    expect(checkoutCorrelationIdempotencyPart({ claimId: 'other' })).not.toBe(
      first
    );
  });

  it('keeps distinct correlation fields distinct when values contain delimiters', () => {
    const first = checkoutCorrelationIdempotencyPart({
      claimId: 'a|runId=b',
      runId: 'c',
    });
    const second = checkoutCorrelationIdempotencyPart({
      claimId: 'a',
      runId: 'b|runId=c',
    });

    expect(first).not.toBe(second);
  });

  it('merges later sources only into missing fields', () => {
    expect(
      mergeCheckoutCorrelation(
        { claimId: 'first' },
        { claimId: 'second', runId: 'run_1' }
      )
    ).toEqual({ claimId: 'first', runId: 'run_1' });
  });
});
