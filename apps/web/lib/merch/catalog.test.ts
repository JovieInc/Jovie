import { beforeEach, describe, expect, it, vi } from 'vitest';

const printful = vi.hoisted(() => ({
  getCatalogProductAvailability: vi.fn(),
  getCatalogVariantPrices: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  listCatalogProducts: vi.fn(),
  listCatalogVariants: vi.fn(),
}));

vi.mock('@/lib/printful/client', () => printful);

import { resolveMerchCatalogSelection } from './catalog';

describe('resolveMerchCatalogSelection', () => {
  beforeEach(() => {
    printful.getCatalogProductAvailability.mockReset();
    printful.getCatalogVariantPrices.mockReset();
    printful.isPrintfulConfigured.mockReset();
    printful.listCatalogProducts.mockReset();
    printful.listCatalogVariants.mockReset();
  });

  it('returns draft-only defaults when Printful credentials are missing', async () => {
    printful.isPrintfulConfigured.mockReturnValue(false);

    const selection = await resolveMerchCatalogSelection('make a tee');

    expect(selection.catalogProductId).toBe(71);
    expect(selection.pricing.printfulCostSource).toBe('jovie_default');
    expect(selection.pricing.printfulCostUpdatedAt).toBeNull();
    expect(selection.providerWarnings).toContain(
      'Printful is not configured; generated merch is draft-only.'
    );
    expect(printful.listCatalogProducts).not.toHaveBeenCalled();
  });

  it('uses Printful catalog variants, availability, and prices when configured', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.listCatalogProducts.mockResolvedValue([
      {
        id: 91,
        name: 'Unisex Heavy Hoodie',
        type: 'hoodie',
        model: 'heavyweight',
        is_discontinued: false,
      },
      {
        id: 71,
        name: 'Unisex Premium T-Shirt',
        type: 't-shirt',
        is_discontinued: false,
      },
    ]);
    printful.listCatalogVariants.mockResolvedValue([
      {
        id: 901,
        catalog_product_id: 91,
        name: 'M / Black',
        size: 'M',
        color: 'Black',
      },
      {
        id: 902,
        catalog_product_id: 91,
        name: 'L / Black',
        size: 'L',
        color: 'Black',
      },
    ]);
    printful.getCatalogVariantPrices.mockResolvedValue({
      currency: 'USD',
      product: {
        id: 91,
        placements: [{ id: 'front', price: '19.00' }],
      },
      variant: {
        id: 901,
        techniques: [{ technique_key: 'dtg', price: '2.25' }],
      },
    });
    printful.getCatalogProductAvailability.mockResolvedValue([
      {
        catalog_variant_id: 901,
        techniques: [
          {
            technique: 'dtg',
            selling_regions: [
              { name: 'north_america', availability: 'available' },
            ],
          },
        ],
      },
      {
        catalog_variant_id: 902,
        techniques: [
          {
            technique: 'dtg',
            selling_regions: [
              { name: 'north_america', availability: 'available' },
            ],
          },
        ],
      },
    ]);

    const selection = await resolveMerchCatalogSelection('make a hoodie');

    expect(selection.catalogProductId).toBe(91);
    expect(selection.productName).toBe('Unisex Heavy Hoodie');
    expect(selection.productType).toBe('hoodie');
    expect(selection.variantMap).toEqual({ m_black: 901, l_black: 902 });
    expect(selection.pricing.estimatedPrintfulProductCostCents).toBe(2125);
    expect(selection.pricing.printfulCostSource).toBe('printful');
    expect(selection.pricing.printfulCostUpdatedAt).toEqual(expect.any(String));
    expect(selection.providerWarnings).toEqual([]);
    expect(printful.listCatalogProducts).toHaveBeenCalledWith({
      sellingRegionName: 'north_america',
      placements: ['front'],
      limit: 50,
    });
  });

  it('falls back to draft-only defaults when provider data is unsafe', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.listCatalogProducts.mockRejectedValue(
      new Error('catalog timeout')
    );

    const selection = await resolveMerchCatalogSelection('make a hat');

    expect(selection.catalogProductId).toBe(71);
    expect(selection.pricing.printfulCostSource).toBe('jovie_default');
    expect(selection.providerWarnings).toEqual([
      'Printful catalog pricing unavailable: catalog timeout',
    ]);
  });
});
