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
    expect(activeIds).not.toContain('price_pro_monthly');
    expect(activeIds).not.toContain(FOUNDING_PRICE_ID);

    const pricingOptions = getAvailablePricing();
    expect(pricingOptions.every(option => !option.legacy)).toBe(true);
    expect(
      pricingOptions.some(option => option.priceId === FOUNDING_PRICE_ID)
    ).toBe(false);
  });

  it('offers only the distinct visibility price while retaining legacy webhook resolution', async () => {
    vi.stubEnv(
      'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
      'price_visibility'
    );
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_old_pro');
    vi.stubEnv('STRIPE_PRICE_MAX_MONTHLY', 'price_old_max');
    const { getAvailablePricing, getPlanFromPriceId, getPriceMappingDetails } =
      await import('@/lib/stripe/config');
    expect(getAvailablePricing()).toEqual([
      expect.objectContaining({
        priceId: 'price_visibility',
        amount: 19900,
        interval: 'month',
      }),
    ]);
    expect(getPlanFromPriceId('price_old_pro')).toBe('pro');
    expect(getPriceMappingDetails('price_old_pro')).toMatchObject({
      amount: 3900,
      legacy: true,
    });
    expect(getPlanFromPriceId('price_old_max')).toBe('max');
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

  it('preserves thumbnail subscribers without selling new Pro through their old price', async () => {
    const founderPriceId = 'price_youtube_thumbnails_founder';
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly');
    vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', 'price_pro_yearly');
    vi.stubEnv(
      'STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY',
      founderPriceId
    );

    const {
      getActivePriceIds,
      getAvailablePricing,
      getPlanFromPriceId,
      isYouTubeThumbnailFounderPriceId,
    } = await import('@/lib/stripe/config');

    expect(getActivePriceIds()).not.toContain(founderPriceId);
    expect(getPlanFromPriceId(founderPriceId)).toBe('pro');
    expect(isYouTubeThumbnailFounderPriceId(founderPriceId)).toBe(true);
    expect(
      getAvailablePricing().some(option => option.priceId === founderPriceId)
    ).toBe(false);
  });
  it('preserves legacy sends but never grants them to new or unknown prices', async () => {
    vi.stubEnv(
      'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
      'price_visibility'
    );
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_legacy');
    const { isLegacyFanSendPrice } = await import('@/lib/stripe/config');
    expect(isLegacyFanSendPrice('price_legacy')).toBe(true);
    expect(isLegacyFanSendPrice('price_visibility')).toBe(false);
    expect(isLegacyFanSendPrice('unknown')).toBe(false);
    expect(isLegacyFanSendPrice(null)).toBe(false);
  });
});
