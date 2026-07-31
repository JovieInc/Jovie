import { beforeEach, describe, expect, it, vi } from 'vitest';

const printful = vi.hoisted(() => ({
  getCatalogProductAvailability: vi.fn(),
  getCatalogProduct: vi.fn(),
  getCatalogVariantPrices: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  listCatalogProducts: vi.fn(),
  listCatalogVariants: vi.fn(),
}));

vi.mock('@/lib/printful/client', () => printful);

import {
  listMerchCatalogProductOptions,
  resolveLiveMerchCatalogProduct,
  resolveMerchCatalogSelection,
} from './catalog';

describe('resolveMerchCatalogSelection', () => {
  beforeEach(() => {
    printful.getCatalogProductAvailability.mockReset();
    printful.getCatalogProduct.mockReset();
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
      limit: 100,
      offset: 0,
    });
  });

  it('searches additional catalog pages before falling back to defaults', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.listCatalogProducts
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: 1000 + index,
          name: `Catalog Product ${index}`,
          type: 'poster',
          is_discontinued: false,
        }))
      )
      .mockResolvedValueOnce([
        {
          id: 222,
          name: 'Structured Dad Hat',
          type: 'hat',
          model: 'cap',
          is_discontinued: false,
        },
      ]);
    printful.listCatalogVariants.mockResolvedValue([
      {
        id: 2201,
        catalog_product_id: 222,
        name: 'Black',
        size: 'One Size',
        color: 'Black',
      },
    ]);
    printful.getCatalogVariantPrices.mockResolvedValue({
      currency: 'USD',
      product: {
        id: 222,
        placements: [{ id: 'front', price: '13.00' }],
      },
      variant: {
        id: 2201,
        techniques: [{ technique_key: 'dtg', price: '1.25' }],
      },
    });
    printful.getCatalogProductAvailability.mockResolvedValue([]);

    const selection = await resolveMerchCatalogSelection('make a hat');

    expect(selection.catalogProductId).toBe(222);
    expect(printful.listCatalogProducts).toHaveBeenCalledTimes(2);
  });

  it('uses explicit Printful catalog product IDs when provided', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.getCatalogProduct.mockResolvedValue({
      id: 333,
      name: 'Heavyweight Tank',
      type: 'tank',
      is_discontinued: false,
    });
    printful.listCatalogVariants.mockResolvedValue([
      {
        id: 3301,
        catalog_product_id: 333,
        name: 'M / Black',
        size: 'M',
        color: 'Black',
      },
    ]);
    printful.getCatalogVariantPrices.mockResolvedValue({
      currency: 'USD',
      product: {
        id: 333,
        placements: [{ id: 'front', price: '15.00' }],
      },
      variant: {
        id: 3301,
        techniques: [{ technique_key: 'dtg', price: '1.25' }],
      },
    });
    printful.getCatalogProductAvailability.mockResolvedValue([]);

    const selection = await resolveMerchCatalogSelection('catalog product 333');

    expect(selection.catalogProductId).toBe(333);
    expect(printful.getCatalogProduct).toHaveBeenCalledWith(333);
    expect(printful.listCatalogProducts).not.toHaveBeenCalled();
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

  it('lists only live products with confirmed variants and pricing', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.listCatalogProducts.mockResolvedValue([
      {
        id: 71,
        name: 'Unisex Staple T-Shirt',
        type: 't-shirt',
        is_discontinued: false,
      },
      {
        id: 91,
        name: 'Unisex Heavy Hoodie',
        type: 'hoodie',
        is_discontinued: false,
      },
      {
        id: 222,
        name: 'Structured Cap',
        type: 'hat',
        is_discontinued: false,
      },
      {
        id: 999,
        name: 'Discontinued Tee',
        type: 't-shirt',
        is_discontinued: true,
      },
    ]);
    printful.listCatalogVariants.mockImplementation(
      async (catalogProductId: number) => [
        {
          id: catalogProductId * 10,
          catalog_product_id: catalogProductId,
          name: 'M / Black',
          size: 'M',
          color: 'Black',
        },
      ]
    );
    printful.getCatalogVariantPrices.mockResolvedValue({
      currency: 'USD',
      product: {
        id: 71,
        placements: [{ id: 'front', price: '15.00' }],
      },
      variant: {
        id: 710,
        techniques: [{ technique_key: 'dtg', price: '2.00' }],
      },
    });
    printful.getCatalogProductAvailability.mockImplementation(
      async (catalogProductId: number) => [
        {
          catalog_variant_id: catalogProductId * 10,
          techniques: [
            {
              technique: 'dtg',
              selling_regions: [
                { name: 'north_america', availability: 'available' },
              ],
            },
          ],
        },
      ]
    );

    await expect(listMerchCatalogProductOptions()).resolves.toEqual([
      {
        catalogProductId: 71,
        productName: 'Unisex Staple T-Shirt',
        productType: 't-shirt',
        colorway: 'Black',
      },
      {
        catalogProductId: 91,
        productName: 'Unisex Heavy Hoodie',
        productType: 'hoodie',
        colorway: 'Black',
      },
      {
        catalogProductId: 222,
        productName: 'Structured Cap',
        productType: 'hat',
        colorway: 'Black',
      },
    ]);
  });

  it('never exposes draft defaults as selectable products', async () => {
    printful.isPrintfulConfigured.mockReturnValue(false);

    await expect(listMerchCatalogProductOptions()).resolves.toEqual([]);
    expect(printful.listCatalogProducts).not.toHaveBeenCalled();
  });

  it('rejects an explicitly selected product without confirmed availability', async () => {
    printful.isPrintfulConfigured.mockReturnValue(true);
    printful.getCatalogProduct.mockResolvedValue({
      id: 333,
      name: 'Heavyweight Tank',
      type: 'tank',
      is_discontinued: false,
    });
    printful.listCatalogVariants.mockResolvedValue([
      {
        id: 3301,
        catalog_product_id: 333,
        name: 'M / Black',
        size: 'M',
        color: 'Black',
      },
    ]);
    printful.getCatalogProductAvailability.mockResolvedValue([
      {
        catalog_variant_id: 3301,
        techniques: [
          {
            technique: 'embroidery',
            selling_regions: [
              { name: 'north_america', availability: 'available' },
            ],
          },
        ],
      },
    ]);

    await expect(resolveLiveMerchCatalogProduct(333)).rejects.toThrow(
      'no confirmed North America variants'
    );
  });
});
