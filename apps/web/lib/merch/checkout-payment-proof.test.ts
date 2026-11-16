import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { assertMerchCheckoutPaymentProof } from './checkout-payment-proof';

const ORDER = {
  id: 'order-1',
  creatorProfileId: 'profile-1',
  merchCardId: 'card-1',
  currency: 'USD' as const,
  stripeCheckoutSessionId: 'cs_fixture',
  stripePaymentIntentId: null as string | null,
  subtotalCents: 3000,
  shippingCents: 500,
  taxCents: 0,
  totalCents: 3500,
};
const CARD = { id: 'card-1', creatorProfileId: 'profile-1' };
function session(patch: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_fixture',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    payment_intent: 'pi_fixture',
    currency: 'usd',
    amount_total: 3500,
    metadata: {
      merch_order_id: 'order-1',
      merch_card_id: 'card-1',
      profile_id: 'profile-1',
    },
    ...patch,
  } as unknown as Stripe.Checkout.Session;
}
describe('merch checkout proof contract', () => {
  it.each([null, ''])(
    'requires a payment intent for positive-priced paid orders (%s)',
    payment_intent => {
      expect(() =>
        assertMerchCheckoutPaymentProof(
          session({ payment_intent }),
          ORDER,
          CARD
        )
      ).toThrow('does not match');
    }
  );
  it('accepts the same expanded payment intent already bound to an order', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(
        session({ payment_intent: { id: 'pi_fixture' } }),
        { ...ORDER, stripePaymentIntentId: 'pi_fixture' },
        CARD
      )
    ).not.toThrow();
  });
  it('does not accept an unbound checkout session', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(
        session(),
        { ...ORDER, stripeCheckoutSessionId: null },
        CARD
      )
    ).toThrow('does not match');
  });
  it('rejects a card owned by another tenant', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(session(), ORDER, {
        ...CARD,
        creatorProfileId: 'profile-other',
      })
    ).toThrow('does not match');
  });
  it('rejects discount accounting even when the final total matches', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(
        session({ total_details: { amount_discount: 100 } }),
        ORDER,
        CARD
      )
    ).toThrow('does not match');
  });
  it('rejects an internally inconsistent stored total', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(
        session(),
        { ...ORDER, subtotalCents: 1 },
        CARD
      )
    ).toThrow('does not match');
  });
  it('rejects missing identity metadata', () => {
    expect(() =>
      assertMerchCheckoutPaymentProof(session({ metadata: {} }), ORDER, CARD)
    ).toThrow('does not match');
  });
});
