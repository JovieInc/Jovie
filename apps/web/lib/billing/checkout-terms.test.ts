import { describe, expect, it } from 'vitest';
import { PLAN_PRICES, toCents } from '@/lib/config/plan-prices';
import { buildCheckoutTerms, CHECKOUT_TERMS_VERSION } from './checkout-terms';

describe('checkout billing terms', () => {
  it('states the same monthly price as billing config, charged now, renewing', () => {
    const terms = buildCheckoutTerms({
      amountCents: toCents(PLAN_PRICES.pro.monthly),
      interval: 'month',
    });
    expect(terms.version).toBe(CHECKOUT_TERMS_VERSION);
    expect(terms.price).toBe(`$${PLAN_PRICES.pro.monthly}.00/mo`);
    expect(terms.timing).toContain('charged');
    expect(terms.timing).toContain('every month until you cancel');
    expect(terms.consentLabel).toContain('renewing automatically');
  });

  it('says when the first charge happens after a mid-trial upgrade', () => {
    const terms = buildCheckoutTerms({
      amountCents: 1200,
      interval: 'month',
      firstChargeAt: new Date('2026-10-30T00:00:00.000Z'),
    });
    expect(terms.timing).toContain(
      "you won't be charged until October 30, 2026 UTC"
    );
    expect(terms.consentLabel).toContain('starting October 30, 2026 UTC');
    expect(terms.timing).not.toContain('today');
  });

  it('describes yearly billing as yearly and never claims a trial or a refund', () => {
    const terms = buildCheckoutTerms({ amountCents: 37500, interval: 'year' });
    expect(terms.price).toBe('$375.00/yr');
    expect(terms.timing).toContain('every year');
    expect(JSON.stringify(terms)).not.toMatch(/trial|free for|refund|no card/i);
  });
});
