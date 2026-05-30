import { describe, it, expect } from 'vitest';
import {
  expandVariants,
  createSellableVariants,
  buildPricingSummary,
  DEFAULT_SIZE_MATRIX,
  DEFAULT_COLOR_MATRIX,
} from './variant-pipeline';
import type { VariantPipelineInput, VariantPipelineOutput } from './variant-pipeline';

function makeInput(overrides?: Partial<VariantPipelineInput>): VariantPipelineInput {
  return {
    designOptionId: 'design-1',
    productId: 71,
    productName: 'Premium T-Shirt',
    baseCostCents: 1200,
    retailPriceCents: 2999,
    markupPercent: 150,
    sizes: ['S', 'M', 'L'],
    colors: ['Black', 'White'],
    placement: 'front',
    mockupUrls: {},
    ...overrides,
  };
}

describe('expandVariants', () => {
  it('expands size x color matrix', () => {
    const input = makeInput({ sizes: ['S', 'M'], colors: ['Black', 'White'] });
    const result = expandVariants(input);
    expect(result.variantCount).toBe(4); // 2 sizes x 2 colors
    expect(result.variants).toHaveLength(4);
  });

  it('uses defaults when sizes/colors empty', () => {
    const input = makeInput({ sizes: [], colors: [] });
    const result = expandVariants(input);
    expect(result.variantCount).toBe(
      DEFAULT_SIZE_MATRIX.length * DEFAULT_COLOR_MATRIX.length
    );
  });

  it('calculates retail price from cost + markup', () => {
    const input = makeInput({ baseCostCents: 1000, markupPercent: 200 });
    const result = expandVariants(input);
    for (const v of result.variants) {
      expect(v.retailPriceCents).toBe(3000); // 1000 * (1 + 2.0) = 3000
      expect(v.profitCents).toBe(2000);
    }
  });

  it('generates unique SKUs per variant', () => {
    const input = makeInput({ sizes: ['S', 'M'], colors: ['Black', 'White'] });
    const result = expandVariants(input);
    const skus = result.variants.map(v => v.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('SKU format is MRCH-{productId}-{size}-{color}', () => {
    const result = expandVariants(
      makeInput({ sizes: ['M'], colors: ['Black'] })
    );
    expect(result.variants[0].sku).toBe('MRCH-71-M-BLACK');
  });

  it('aggregates totals', () => {
    const input = makeInput({ sizes: ['M', 'L'], colors: ['Black'] });
    const result = expandVariants(input);
    expect(result.totalBaseCostCents).toBe(2400); // 1200 x 2
    expect(result.totalRetailCents).toBeGreaterThan(0);
    expect(result.totalProfitCents).toBeGreaterThan(0);
    expect(result.unavailableCount).toBe(0);
  });
});

describe('createSellableVariants', () => {
  it('creates correct number of sellable variants', () => {
    const input = makeInput({ sizes: ['S', 'M'], colors: ['Black'] });
    const pipeline = expandVariants(input);
    const sellable = createSellableVariants('design-1', pipeline, {});

    expect(sellable).toHaveLength(2);
    expect(sellable[0].designOptionId).toBe('design-1');
    expect(sellable[0].status).toBe('draft');
  });

  it('maps mockup URLs by size-color key', () => {
    const input = makeInput({ sizes: ['M'], colors: ['Black'] });
    const pipeline = expandVariants(input);
    const mockupUrls = { 'M-Black': 'https://cdn.test/mockup.png' };
    const sellable = createSellableVariants('design-1', pipeline, mockupUrls);

    expect(sellable[0].imageUrl).toBe('https://cdn.test/mockup.png');
  });

  it('returns null imageUrl when mockup not found', () => {
    const input = makeInput({ sizes: ['L'], colors: ['White'] });
    const pipeline = expandVariants(input);
    const sellable = createSellableVariants('design-1', pipeline, {});

    expect(sellable[0].imageUrl).toBeNull();
  });
});

describe('buildPricingSummary', () => {
  it('calculates min/max/avg from variant prices', () => {
    const variants = [
      { priceCents: 1000, profitCents: 300 },
      { priceCents: 2000, profitCents: 500 },
      { priceCents: 3000, profitCents: 700 },
    ] as Parameters<typeof buildPricingSummary>[0];

    const summary = buildPricingSummary(variants);
    expect(summary.minPriceCents).toBe(1000);
    expect(summary.maxPriceCents).toBe(3000);
    expect(summary.avgPriceCents).toBe(2000);
    expect(summary.minProfitCents).toBe(300);
    expect(summary.maxProfitCents).toBe(700);
  });
});
