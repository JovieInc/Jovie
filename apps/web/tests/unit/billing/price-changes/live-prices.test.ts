import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractLivePrices,
  LIVE_PRICE_SOURCE_FILES,
  type LivePriceSources,
} from '@/lib/billing/price-changes/live-prices';
import {
  ARTIST_VISIBILITY_OFFER,
  PLAN_PRICES,
  toCents,
} from '@/lib/config/plan-prices';
import { HARDCODED_LEGACY_PRICES } from '@/lib/stripe/legacy-prices';
import { LEGACY_STRIPE_PRICE_IDS } from '@/lib/stripe/price-id-mapping';

const repoRoot = join(__dirname, '../../../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const sources = Object.fromEntries(
  Object.entries(LIVE_PRICE_SOURCE_FILES).map(([name, path]) => [
    name,
    read(path),
  ])
) as unknown as LivePriceSources;

describe('live price extractor', () => {
  const table = extractLivePrices(sources);

  it('agrees with the real plan price exports', () => {
    expect(table['offer:pro:month']).toBe(
      toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)
    );
    expect(table['offer:pro:year']).toBe(toCents(PLAN_PRICES.pro.yearly));
    expect(table['offer:max:month']).toBe(toCents(PLAN_PRICES.max.monthly));
    expect(table['offer:max:year']).toBe(toCents(PLAN_PRICES.max.yearly));
  });

  it('agrees with every legacy price definition', () => {
    for (const legacy of HARDCODED_LEGACY_PRICES) {
      const name = Object.entries(LEGACY_STRIPE_PRICE_IDS).find(
        ([, id]) => id === legacy.priceId
      )?.[0];
      expect(name, legacy.description).toBeDefined();
      expect(table[`legacy:${name}`], legacy.description).toBe(legacy.amount);
    }
  });

  it('sees the hard-coded amounts in the Stripe price config', () => {
    expect(table['config:youtubeThumbnailsFounderMonthly']).toBe(2900);
    expect(table['config:proMonthly']).toBe(3900);
  });

  it('fails loudly when a price file is restructured out from under it', () => {
    expect(() =>
      extractLivePrices({
        ...sources,
        planPrices: sources.planPrices.replace('monthlyUsd', 'monthly_usd'),
      })
    ).toThrow(/could not find/);
  });
});
