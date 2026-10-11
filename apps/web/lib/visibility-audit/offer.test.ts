import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
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

  it('shows the credited price only when the flag and payment link are both set', () => {
    const offer = resolveVisibilityAuditOffer({
      flagEnabled: true,
      paymentLinkUrl: PAYMENT_LINK,
    });
    expect(offer).toMatchObject({
      visible: true,
      href: PAYMENT_LINK,
      priceUsd: ARTIST_VISIBILITY_OFFER.pro.monthlyUsd,
    });
    if (offer.visible) {
      expect(offer.detail).toContain('credited toward the first month');
      expect(offer.label).toContain(`$${offer.priceUsd}`);
    }
  });
});
