import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncProductCost } from './printful-catalog';

// Mock the Printful client since it requires server environment
vi.mock('@/lib/printful/client', () => ({
  getCatalogProduct: vi.fn(),
  getCatalogVariantPrices: vi.fn(),
  isPrintfulConfigured: vi.fn(),
  listCatalogProducts: vi.fn(),
  listCatalogVariants: vi.fn(),
}));

const printful = vi.mocked(await import('@/lib/printful/client'));

async function loadModule() {
  vi.resetModules();
  return import('./printful-catalog');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Printful catalog service', () => {
  describe('getPrintfulCatalog', () => {
    it('returns mock catalog data when Printful is not configured', async () => {
      printful.isPrintfulConfigured.mockReturnValue(false);
      const { getPrintfulCatalog } = await loadModule();

      const result = await getPrintfulCatalog();

      expect(result.success).toBe(true);
      expect(result.source).toBe('mock');
      expect(result.products.length).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);

      // Verify first product structure
      const first = result.products[0];
      expect(first).toHaveProperty('catalogProductId');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('variants');
      expect(first).toHaveProperty('cost');
      expect(first.variants.length).toBeGreaterThan(0);
      expect(first.cost?.costSource).toBe('mock');
    });

    it('calls syncPrintfulCatalog when configured', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.listCatalogProducts.mockResolvedValue([
        { id: 71, name: 'Unisex Premium T-Shirt', is_discontinued: false },
      ]);
      printful.listCatalogVariants.mockResolvedValue([
        {
          id: 4011,
          catalog_product_id: 71,
          name: 'L / Black',
          size: 'L',
          color: 'Black',
        },
      ]);
      printful.getCatalogVariantPrices.mockResolvedValue({
        currency: 'USD',
        product: {
          id: 71,
          placements: [
            { id: 'front', price: '17.50', discounted_price: '16.75' },
          ],
        },
      });

      const { getPrintfulCatalog } = await loadModule();
      const result = await getPrintfulCatalog();

      expect(result.success).toBe(true);
      expect(result.source).toBe('printful');
      expect(result.products.length).toBe(1);
      expect(printful.listCatalogProducts).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncPrintfulCatalog', () => {
    it('fetches and normalizes products with variants and cost data', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.listCatalogProducts.mockResolvedValue([
        {
          id: 71,
          name: 'Unisex Premium T-Shirt',
          type: 'T-Shirt',
          brand: 'Bella+Canvas',
          is_discontinued: false,
        },
        {
          id: 91,
          name: 'Unisex Heavy Hoodie',
          type: 'Hoodie',
          is_discontinued: false,
        },
      ]);
      printful.listCatalogVariants
        .mockResolvedValueOnce([
          {
            id: 4011,
            catalog_product_id: 71,
            name: 'L / Black',
            size: 'L',
            color: 'Black',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 4003,
            catalog_product_id: 91,
            name: 'L / Black',
            size: 'L',
            color: 'Black',
          },
        ]);
      printful.getCatalogVariantPrices
        .mockResolvedValueOnce({
          currency: 'USD',
          product: {
            id: 71,
            placements: [
              { id: 'front', price: '17.50', discounted_price: '16.75' },
            ],
          },
        })
        .mockResolvedValueOnce({
          currency: 'USD',
          product: {
            id: 91,
            placements: [
              { id: 'front', price: '22.50', discounted_price: '21.25' },
            ],
          },
        });

      const { syncPrintfulCatalog } = await loadModule();
      const result = await syncPrintfulCatalog();

      expect(result.success).toBe(true);
      expect(result.products.length).toBe(2);
      expect(result.totalVariants).toBe(2);

      // Verify cost data
      const tee = result.products.find(p => p.catalogProductId === 71);
      expect(tee?.cost?.minProductCostCents).toBe(1675);
      expect(tee?.cost?.costSource).toBe('printful');

      const hoodie = result.products.find(p => p.catalogProductId === 91);
      expect(hoodie?.cost?.minProductCostCents).toBe(2125);
    });

    it('collects errors for individual product failures', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.listCatalogProducts.mockResolvedValue([
        { id: 71, name: 'Unisex Premium T-Shirt', is_discontinued: false },
      ]);
      printful.listCatalogVariants.mockRejectedValue(
        new Error('variant fetch failed')
      );

      const { syncPrintfulCatalog } = await loadModule();
      const result = await syncPrintfulCatalog();

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to sync product');
    });

    it('filters out discontinued products by default', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.listCatalogProducts.mockResolvedValue([
        { id: 1, name: 'Active Product', is_discontinued: false },
        { id: 2, name: 'Discontinued Product', is_discontinued: true },
      ]);
      printful.listCatalogVariants.mockResolvedValue([]);
      printful.getCatalogVariantPrices.mockRejectedValue(
        new Error('no variants')
      );

      const { syncPrintfulCatalog } = await loadModule();
      const result = await syncPrintfulCatalog();

      expect(result.products.length).toBe(1);
      expect(result.products[0].name).toBe('Active Product');
    });
  });

  describe('findCatalogProduct', () => {
    it('finds a product by ID from mock data when not configured', async () => {
      printful.isPrintfulConfigured.mockReturnValue(false);
      const { findCatalogProduct } = await loadModule();

      const product = await findCatalogProduct(71);
      expect(product).not.toBeNull();
      expect(product?.name).toBe('Unisex Premium T-Shirt');

      const missing = await findCatalogProduct(999);
      expect(missing).toBeNull();
    });

    it('fetches from live API when configured', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.getCatalogProduct.mockResolvedValue({
        id: 71,
        name: 'Unisex Premium T-Shirt',
        is_discontinued: false,
      });
      printful.listCatalogVariants.mockResolvedValue([
        {
          id: 4011,
          catalog_product_id: 71,
          name: 'L / Black',
          size: 'L',
          color: 'Black',
        },
      ]);
      printful.getCatalogVariantPrices.mockResolvedValue({
        currency: 'USD',
        product: { id: 71, placements: [] },
      });

      const { findCatalogProduct } = await loadModule();
      const product = await findCatalogProduct(71);

      expect(product).not.toBeNull();
      expect(product?.name).toBe('Unisex Premium T-Shirt');
      expect(printful.getCatalogProduct).toHaveBeenCalledWith(71);
    });
  });

  describe('refreshProductCosts', () => {
    it('returns mock cost when not configured', async () => {
      printful.isPrintfulConfigured.mockReturnValue(false);
      const { refreshProductCosts } = await loadModule();

      const cost = await refreshProductCosts(71);
      expect(cost).not.toBeNull();
      expect(cost?.costSource).toBe('mock');
      expect(cost?.minProductCostCents).toBeGreaterThan(0);

      const noCost = await refreshProductCosts(999);
      expect(noCost).toBeNull();
    });

    it('returns null for product with no variants', async () => {
      printful.isPrintfulConfigured.mockReturnValue(true);
      printful.getCatalogProduct.mockResolvedValue({
        id: 1,
        name: 'Empty Product',
        is_discontinued: false,
      });
      printful.listCatalogVariants.mockResolvedValue([]);

      const { refreshProductCosts } = await loadModule();
      const cost = await refreshProductCosts(1);

      expect(cost).toBeNull();
    });
  });

  describe('isCostDataFresh', () => {
    it('returns false for null/undefined cost', async () => {
      const { isCostDataFresh } = await loadModule();
      expect(isCostDataFresh(null)).toBe(false);
      expect(isCostDataFresh(undefined)).toBe(false);
    });

    it('returns true for recently fetched cost data', async () => {
      const { isCostDataFresh } = await loadModule();
      const freshCost: SyncProductCost = {
        currency: 'USD',
        placements: [],
        minProductCostCents: 0,
        maxProductCostCents: 0,
        costSource: 'mock',
        fetchedAt: new Date().toISOString(),
      };

      expect(isCostDataFresh(freshCost)).toBe(true);
    });

    it('returns false for stale cost data', async () => {
      const { isCostDataFresh } = await loadModule();
      const staleDate = new Date(
        Date.now() - 25 * 60 * 60 * 1000
      ).toISOString();
      const staleCost: SyncProductCost = {
        currency: 'USD',
        placements: [],
        minProductCostCents: 0,
        maxProductCostCents: 0,
        costSource: 'printful',
        fetchedAt: staleDate,
      };

      expect(isCostDataFresh(staleCost, 24 * 60 * 60 * 1000)).toBe(false);
    });
  });

  describe('getBestCostEstimateCents', () => {
    it('returns null for null/undefined cost', async () => {
      const { getBestCostEstimateCents } = await loadModule();
      expect(getBestCostEstimateCents(null)).toBeNull();
    });

    it('returns minimum discounted price from placements', async () => {
      const { getBestCostEstimateCents } = await loadModule();
      const cost: SyncProductCost = {
        currency: 'USD',
        placements: [
          {
            placementId: 'front',
            title: null,
            type: null,
            priceCents: 1750,
            discountedPriceCents: 1675,
            techniqueKey: 'dtg',
          },
          {
            placementId: 'back',
            title: null,
            type: null,
            priceCents: 1950,
            discountedPriceCents: 1850,
            techniqueKey: 'dtg',
          },
        ],
        minProductCostCents: 1675,
        maxProductCostCents: 1950,
        costSource: 'mock',
        fetchedAt: new Date().toISOString(),
      };

      expect(getBestCostEstimateCents(cost)).toBe(1675);
    });

    it('falls back to full price when discounted price is null', async () => {
      const { getBestCostEstimateCents } = await loadModule();
      const cost: SyncProductCost = {
        currency: 'USD',
        placements: [
          {
            placementId: 'front',
            title: null,
            type: null,
            priceCents: 1750,
            discountedPriceCents: null,
            techniqueKey: 'dtg',
          },
        ],
        minProductCostCents: 1750,
        maxProductCostCents: 1750,
        costSource: 'mock',
        fetchedAt: new Date().toISOString(),
      };

      expect(getBestCostEstimateCents(cost)).toBe(1750);
    });
  });

  describe('MOCK_CATALOG_PRODUCTS', () => {
    it('contains expected product types', async () => {
      const { MOCK_CATALOG_PRODUCTS } = await loadModule();
      const names = MOCK_CATALOG_PRODUCTS.map(p => p.name);
      expect(names).toContain('Unisex Premium T-Shirt');
      expect(names).toContain('Unisex Heavy Hoodie');
      expect(names).toContain('Trucker Cap');
      expect(names).toContain('Unisex Tank Top');
    });

    it('each product has variants with valid IDs', async () => {
      const { MOCK_CATALOG_PRODUCTS } = await loadModule();
      for (const product of MOCK_CATALOG_PRODUCTS) {
        expect(product.variants.length).toBeGreaterThan(0);
        for (const variant of product.variants) {
          expect(variant.catalogVariantId).toBeGreaterThan(0);
          expect(variant.catalogProductId).toBe(product.catalogProductId);
        }
      }
    });

    it('each product has cost data', async () => {
      const { MOCK_CATALOG_PRODUCTS } = await loadModule();
      for (const product of MOCK_CATALOG_PRODUCTS) {
        expect(product.cost).not.toBeNull();
        expect(product.cost?.minProductCostCents).toBeGreaterThan(0);
      }
    });
  });
});
