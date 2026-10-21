import { describe, expect, it } from 'vitest';
import { resolveVisibilityAuditOffer } from './offer';

const PAYMENT_LINK = 'https://buy.stripe.com/test_a1b2c3';

describe('visibility audit offer', () => {
  it('stays hidden when the flag is off', () => {
    expect(
      resolveVisibilityAuditOffer({
        flagEnabled: false,
        paymentLinkUrl: PAYMENT_LINK,
      })
    ).toEqual({ visible: false, reason: 'flag_off' });
  });

  it('stays hidden when the payment link is missing or not a Stripe Payment Link', () => {
    expect(
      resolveVisibilityAuditOffer({
        flagEnabled: true,
        paymentLinkUrl: undefined,
      })
    ).toEqual({ visible: false, reason: 'payment_link_missing' });
    expect(
      resolveVisibilityAuditOffer({
        flagEnabled: true,
        paymentLinkUrl: 'https://example.com/pay',
      }).visible
    ).toBe(false);
    expect(
      resolveVisibilityAuditOffer({
        flagEnabled: true,
        paymentLinkUrl: 'http://buy.stripe.com/test_a1b2c3',
      }).visible
    ).toBe(false);
  });

  it('shows the one-off audit price only when the flag and payment link are both set', () => {
    const offer = resolveVisibilityAuditOffer({
      flagEnabled: true,
      paymentLinkUrl: PAYMENT_LINK,
    });
    expect(offer).toMatchObject({
      visible: true,
      href: PAYMENT_LINK,
      priceUsd: 199,
    });
    if (offer.visible) {
      expect(offer.detail).toContain('one-time purchase');
      expect(offer.label).toContain(`$${offer.priceUsd}`);
    }
  });
});
