import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FOUNDING_PRICE_ID = 'price_1T1DegAAI1NrDqJSTtjAwLBi';

describe('stripe config legacy price mappings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves JOV-1769 founding price ID to pro entitlements', async () => {
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly');
    vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', 'price_pro_yearly');

    const { getPlanFromPriceId, getPriceMappingDetails } = await import(
      '@/lib/stripe/config'
    );

    expect(getPlanFromPriceId(FOUNDING_PRICE_ID)).toBe('pro');
    expect(getPriceMappingDetails(FOUNDING_PRICE_ID)?.legacy).toBe(true);
    expect(getPriceMappingDetails(FOUNDING_PRICE_ID)?.description).toContain(
      'Founding'
    );
  });

  it('excludes legacy prices from active checkout price IDs', async () => {
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly');
    vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', 'price_pro_yearly');

    const { getActivePriceIds, getAvailablePricing } = await import(
      '@/lib/stripe/config'
    );

    const activeIds = getActivePriceIds();
    expect(activeIds).toContain('price_pro_monthly');
    expect(activeIds).not.toContain(FOUNDING_PRICE_ID);

    const pricingOptions = getAvailablePricing();
    expect(pricingOptions.every(option => !option.legacy)).toBe(true);
    expect(
      pricingOptions.some(option => option.priceId === FOUNDING_PRICE_ID)
    ).toBe(false);
  });

  it('prefers STRIPE_PRICE_FOUNDING_MONTHLY env over hardcoded fallback', async () => {
    const envFoundingId = 'price_founding_from_env';
    vi.stubEnv('STRIPE_PRICE_FOUNDING_MONTHLY', envFoundingId);
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly');
    vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', 'price_pro_yearly');

    const { getPlanFromPriceId, getPriceMappingDetails } = await import(
      '@/lib/stripe/config'
    );

    expect(getPlanFromPriceId(envFoundingId)).toBe('pro');
    expect(getPriceMappingDetails(envFoundingId)?.legacy).toBe(true);
    // Hardcoded ID still resolves when env points elsewhere
    expect(getPlanFromPriceId(FOUNDING_PRICE_ID)).toBe('pro');
  });
});
