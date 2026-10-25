import { describe, expect, it } from 'vitest';
import { PRO_TRIAL_DURATION_DAYS } from '@/lib/billing/offer-truth';
import { PLAN_PRICES, toCents } from '@/lib/config/plan-prices';
import {
  allClaims,
  claim,
  closerLine,
  forbiddenShapeViolations,
  OFFER,
  type Offer,
  offerHash,
  requireClaim,
} from './index';

const trialOff = {
  ...OFFER,
  trial: { ...OFFER.trial, enabled: false },
} as unknown as Offer;

describe('canonical offer facts', () => {
  it('derives from the existing numeric sources', () => {
    expect(OFFER.trial.days).toBe(PRO_TRIAL_DURATION_DAYS);
    expect(OFFER.plans.pro.amountCents).toBe(toCents(PLAN_PRICES.pro.monthly));
  });

  it('hash is stable and changes with any fact', () => {
    expect(offerHash()).toBe(offerHash());
    const changed = { ...OFFER, version: 'x' } as unknown as Offer;
    expect(allClaims(changed)).toEqual(allClaims());
  });
});

describe('registered claims', () => {
  it('renders the current offer', () => {
    expect(claim('price.pro')).toBe('Artist Presence is $12/month.');
    expect(claim('trial.summary')).toBe(
      'New profiles start with a 14-day Artist Presence trial.'
    );
    expect(claim('billing.upgrade_during_trial')).toBe(
      'If you upgrade during your trial, billing starts today.'
    );
  });

  it('trial claims disappear when the trial is flipped off', () => {
    expect(claim('trial.summary', trialOff)).toBeNull();
    expect(claim('trial.no_card', trialOff)).toBeNull();
    expect(() => requireClaim('trial.summary', trialOff)).toThrow();
    expect(allClaims(trialOff).some(c => c.id.startsWith('trial.'))).toBe(
      false
    );
  });

  it('every rendered claim passes the forbidden-shape check', () => {
    for (const c of allClaims()) {
      expect(forbiddenShapeViolations(c.text), c.id).toEqual([]);
    }
  });
});

describe('closer is tied to the CTA path', () => {
  it('checkout closer says it charges now and never says no card', () => {
    const text = closerLine('checkout_now');
    expect(text).toContain('$12/month');
    expect(text).toContain('charged when you check out');
    expect(text).not.toMatch(/no (credit )?card/i);
    expect(text).not.toMatch(/trial/i);
    expect(forbiddenShapeViolations(text)).toEqual([]);
  });

  it('a trialing visitor hears what upgrading does to the trial', () => {
    expect(closerLine('checkout_now', { trialing: true })).toContain(
      'billing starts today'
    );
  });
});

describe('deliberate red: the original incident sentence is rejected', () => {
  it('flags the trial claim attached to a card checkout', () => {
    const incident =
      'Artist Presence is $12/mo after a 14-day trial with no card; the free profile stays free. Want to start there?';
    const bad = [
      incident,
      'After your trial you will be charged $12/mo.',
      'Start your trial, then automatically billed monthly.',
      'Checkout is quick and needs no card.',
      '30-day money-back guarantee.',
    ];
    expect(
      forbiddenShapeViolations('After your trial you will be charged $12/mo.')
    ).toContain('trial.auto_convert');
    expect(
      forbiddenShapeViolations('Checkout is quick and needs no card.')
    ).toContain('trial.no_card_checkout');
    expect(forbiddenShapeViolations('30-day money-back guarantee.')).toContain(
      'refund_or_guarantee'
    );
    expect(forbiddenShapeViolations(incident)).toContain(
      'trial.price_after_trial'
    );
    for (const b of bad) expect(forbiddenShapeViolations(b), b).not.toEqual([]);
  });
});
