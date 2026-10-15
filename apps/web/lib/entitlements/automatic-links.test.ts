import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paid = {
  isPro: true,
  plan: 'pro',
  stripePriceId: 'price_visibility',
  stripeSubscriptionId: 'sub_active',
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY', 'price_visibility');
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_legacy_pro');
  vi.stubEnv('STRIPE_PRICE_MAX_MONTHLY', 'price_legacy_max');
  vi.stubEnv(
    'STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY',
    'price_thumbnail'
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('automatic public link capability', () => {
  it('grants only the exact documented active offer', async () => {
    const { canAutomaticallyCreateLinks } = await import('./automatic-links');
    expect(canAutomaticallyCreateLinks(paid)).toBe(true);
  });

  it.each([
    { plan: 'free' },
    { plan: 'trial' },
    { plan: 'founding' },
    { plan: 'max' },
    { plan: 'growth' },
    { plan: 'enterprise' },
    { plan: 'unknown' },
    { plan: null },
    { isPro: false },
    { isPro: null },
    { stripeSubscriptionId: null },
    { stripeSubscriptionId: '' },
    { stripePriceId: null },
    { stripePriceId: '' },
    { stripePriceId: 'price_legacy_pro' },
    { stripePriceId: 'price_legacy_max' },
    { stripePriceId: 'price_thumbnail' },
    { stripePriceId: 'price_unknown' },
  ])('denies insufficient or unrelated billing evidence: %j', async patch => {
    const { canAutomaticallyCreateLinks } = await import('./automatic-links');
    expect(canAutomaticallyCreateLinks({ ...paid, ...patch })).toBe(false);
  });

  it('fails closed when the configured offer price collides with a legacy price', async () => {
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_visibility');
    const { canAutomaticallyCreateLinks } = await import('./automatic-links');
    expect(canAutomaticallyCreateLinks(paid)).toBe(false);
  });

  it('never grants automation from a plan alias, and keeps manual creation available', async () => {
    const { getAllPlanIds, getEntitlements } = await import('./registry');
    for (const plan of getAllPlanIds()) {
      expect(getEntitlements(plan).booleans.canAutoCreateLinks).toBe(false);
      expect(getEntitlements(plan).booleans.canCreateManualReleases).toBe(true);
    }
  });
});
