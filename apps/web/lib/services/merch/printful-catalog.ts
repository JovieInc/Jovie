import 'server-only';

/**
 * Printful Catalog Service
 *
 * Provides catalog sync, cost integration, and mock data for the Printful merch
 * catalog. This service wraps the raw Printful API client with higher-level
 * operations:
 *
 * 1. Fetch and normalize the full Printful product catalog
 * 2. Map products, variants, and cost data to typed sync structures
 * 3. Provide mock/dry catalog data when Printful API keys are not configured
 * 4. Support catalog refresh and cost-data staleness checks
 *
 * Architecture:
 * - Uses the low-level Printful API client from @/lib/printful/client
 * - Returns typed catalog sync data
 * - Follows the same pattern as other services (canvas, pitch, social-links)
 *
 * @see @/lib/printful/client - Raw Printful API client
 * @see @/lib/merch/catalog.ts - Catalog selection for merch generation
 * @see @/lib/merch/pricing.ts - Pricing snapshot builder
 */

import type {
  PrintfulCatalogProduct as RawPrintfulProduct,
  PrintfulCatalogVariant as RawPrintfulVariant,
  PrintfulCatalogVariantPrices,
} from '@/lib/printful/client';
import {
  getCatalogProduct,
  getCatalogVariantPrices,
  getCatalogProductAvailability,
  isPrintfulConfigured,
  listCatalogProducts,
  listCatalogVariants,
} from '@/lib/printful/client';

// ---------------------------------------------------------------------------
// Types - Catalog Sync
// ---------------------------------------------------------------------------

/** Normalized catalog product with embedded variant and cost data */
export interface SyncCatalogProduct {
  readonly catalogProductId: number;
  readonly name: string;
  readonly type: string | null;
  readonly brand: string | null;
  readonly model: string | null;
  readonly image: string | null;
  readonly isDiscontinued: boolean;
  readonly variants: SyncCatalogVariant[];
  readonly cost: SyncProductCost | null;
  readonly syncedAt: string;
}

/** Normalized catalog variant */
export interface SyncCatalogVariant {
  readonly catalogVariantId: number;
  readonly catalogProductId: number;
  readonly name: string;
  readonly size: string | null;
  readonly color: string | null;
  readonly colorCode: string | null;
  readonly image: string | null;
  readonly cost: SyncVariantCost | null;
}

/** Product-level cost data aggregated from Printful pricing */
export interface SyncProductCost {
  readonly currency: string;
  readonly placements: SyncPlacementCost[];
  readonly minProductCostCents: number;
  readonly maxProductCostCents: number;
  readonly costSource: 'printful' | 'mock';
  readonly fetchedAt: string;
}

/** Per-placement cost data */
export interface SyncPlacementCost {
  readonly placementId: string;
  readonly title: string | null;
  readonly type: string | null;
  readonly priceCents: number | null;
  readonly discountedPriceCents: number | null;
  readonly techniqueKey: string | null;
}

/** Per-variant cost data from Printful pricing */
export interface SyncVariantCost {
  readonly catalogVariantId: number;
  readonly techniques: SyncTechniqueCost[];
  readonly minCostCents: number;
  readonly maxCostCents: number;
}

/** Per-technique cost for a variant */
export interface SyncTechniqueCost {
  readonly techniqueKey: string;
  readonly techniqueDisplayName: string | null;
  readonly priceCents: number | null;
  readonly discountedPriceCents: number | null;
}

/** Overall catalog sync result */
export interface CatalogSyncResult {
  readonly success: boolean;
  readonly products: SyncCatalogProduct[];
  readonly syncedAt: string;
  readonly durationMs: number;
  readonly totalProducts: number;
  readonly totalVariants: number;
  readonly errors: string[];
  readonly source: 'printful' | 'mock';
}

/** Options for catalog sync */
export interface CatalogSyncOptions {
  readonly sellingRegionName?: string;
  readonly placements?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
  readonly includeDiscontinued?: boolean;
  readonly currency?: string;
}

// ---------------------------------------------------------------------------
// Dry/Mock Catalog Data
// ---------------------------------------------------------------------------

/**
 * Curated mock catalog data used when Printful API is not configured.
 * Represents a small set of common Printful products with realistic
 * variant IDs, cost estimates, and availability data.
 *
 * These values are based on the actual Printful catalog and are
 * accurate enough for development, testing, and draft-only mode.
 */
export const MOCK_CATALOG_PRODUCTS: SyncCatalogProduct[] = [
  {
    catalogProductId: 71,
    name: 'Unisex Premium T-Shirt',
    type: 'T-Shirt',
    brand: 'Bella+Canvas',
    model: '6400',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4009, catalogProductId: 71, name: 'S / Black', size: 'S', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4010, catalogProductId: 71, name: 'M / Black', size: 'M', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4011, catalogProductId: 71, name: 'L / Black', size: 'L', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4012, catalogProductId: 71, name: 'XL / Black', size: 'XL', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4013, catalogProductId: 71, name: 'S / White', size: 'S', color: 'White', colorCode: 'FFFFFF', image: null, cost: null },
      { catalogVariantId: 4014, catalogProductId: 71, name: 'M / White', size: 'M', color: 'White', colorCode: 'FFFFFF', image: null, cost: null },
      { catalogVariantId: 4015, catalogProductId: 71, name: 'L / White', size: 'L', color: 'White', colorCode: 'FFFFFF', image: null, cost: null },
      { catalogVariantId: 4016, catalogProductId: 71, name: 'XL / White', size: 'XL', color: 'White', colorCode: 'FFFFFF', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Print', type: 'print_area', priceCents: 1750, discountedPriceCents: 1675, techniqueKey: 'dtg' },
        { placementId: 'back', title: 'Back Print', type: 'print_area', priceCents: 1950, discountedPriceCents: 1850, techniqueKey: 'dtg' },
      ],
      minProductCostCents: 1675,
      maxProductCostCents: 1950,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
  {
    catalogProductId: 91,
    name: 'Unisex Heavy Hoodie',
    type: 'Hoodie',
    brand: 'Gildan',
    model: '18500',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4001, catalogProductId: 91, name: 'S / Black', size: 'S', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4002, catalogProductId: 91, name: 'M / Black', size: 'M', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4003, catalogProductId: 91, name: 'L / Black', size: 'L', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4004, catalogProductId: 91, name: 'XL / Black', size: 'XL', color: 'Black', colorCode: '000000', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Print', type: 'print_area', priceCents: 2250, discountedPriceCents: 2125, techniqueKey: 'dtg' },
        { placementId: 'back', title: 'Back Print', type: 'print_area', priceCents: 2650, discountedPriceCents: 2500, techniqueKey: 'dtg' },
      ],
      minProductCostCents: 2125,
      maxProductCostCents: 2650,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
  {
    catalogProductId: 72,
    name: 'Unisex Organic T-Shirt',
    type: 'T-Shirt',
    brand: 'Bella+Canvas',
    model: '6410',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4017, catalogProductId: 72, name: 'S / Black', size: 'S', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4018, catalogProductId: 72, name: 'M / Black', size: 'M', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4019, catalogProductId: 72, name: 'L / Black', size: 'L', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4020, catalogProductId: 72, name: 'XL / Black', size: 'XL', color: 'Black', colorCode: '000000', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Print', type: 'print_area', priceCents: 1950, discountedPriceCents: 1875, techniqueKey: 'dtg' },
      ],
      minProductCostCents: 1875,
      maxProductCostCents: 1875,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
  {
    catalogProductId: 67,
    name: 'Unisex Pullover Hoodie',
    type: 'Hoodie',
    brand: 'Independent',
    model: 'IC-1850',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4101, catalogProductId: 67, name: 'S / Black', size: 'S', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4102, catalogProductId: 67, name: 'M / Black', size: 'M', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4103, catalogProductId: 67, name: 'L / Black', size: 'L', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4104, catalogProductId: 67, name: 'XL / Black', size: 'XL', color: 'Black', colorCode: '000000', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Print', type: 'print_area', priceCents: 2100, discountedPriceCents: 1995, techniqueKey: 'dtg' },
        { placementId: 'back', title: 'Back Print', type: 'print_area', priceCents: 2500, discountedPriceCents: 2375, techniqueKey: 'dtg' },
      ],
      minProductCostCents: 1995,
      maxProductCostCents: 2500,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
  {
    catalogProductId: 47,
    name: 'Trucker Cap',
    type: 'Hat',
    brand: 'Flexfit',
    model: '6277',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4201, catalogProductId: 47, name: 'OSFA / Black', size: 'OSFA', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4202, catalogProductId: 47, name: 'OSFA / White', size: 'OSFA', color: 'White', colorCode: 'FFFFFF', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Embroidery', type: 'embroidery_area', priceCents: 850, discountedPriceCents: 799, techniqueKey: 'embroidery' },
      ],
      minProductCostCents: 799,
      maxProductCostCents: 799,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
  {
    catalogProductId: 55,
    name: 'Unisex Tank Top',
    type: 'Tank Top',
    brand: 'Hanes',
    model: '4932',
    image: null,
    isDiscontinued: false,
    variants: [
      { catalogVariantId: 4301, catalogProductId: 55, name: 'S / Black', size: 'S', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4302, catalogProductId: 55, name: 'M / Black', size: 'M', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4303, catalogProductId: 55, name: 'L / Black', size: 'L', color: 'Black', colorCode: '000000', image: null, cost: null },
      { catalogVariantId: 4304, catalogProductId: 55, name: 'XL / Black', size: 'XL', color: 'Black', colorCode: '000000', image: null, cost: null },
    ],
    cost: {
      currency: 'USD',
      placements: [
        { placementId: 'front', title: 'Front Print', type: 'print_area', priceCents: 1400, discountedPriceCents: 1325, techniqueKey: 'dtg' },
      ],
      minProductCostCents: 1325,
      maxProductCostCents: 1325,
      costSource: 'mock',
      fetchedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

// ---------------------------------------------------------------------------
// Public API - Sync Functions
// ---------------------------------------------------------------------------

/**
 * Get the full Printful catalog, fetching from the live API or returning
 * mock data when Printful is not configured.
 */
export async function getPrintfulCatalog(
  options?: CatalogSyncOptions
): Promise<CatalogSyncResult> {
  const startedAt = Date.now();

  if (!isPrintfulConfigured()) {
    return {
      success: true,
      products: MOCK_CATALOG_PRODUCTS,
      syncedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      totalProducts: MOCK_CATALOG_PRODUCTS.length,
      totalVariants: MOCK_CATALOG_PRODUCTS.reduce(
        (sum, p) => sum + p.variants.length, 0
      ),
      errors: [],
      source: 'mock',
    };
  }

  return syncPrintfulCatalog(options);
}

/**
 * Fetch and normalize the live Printful catalog.
 * Fetches products, variants, pricing per variant, and assembles
 * SyncCatalogProduct records.
 */
export async function syncPrintfulCatalog(
  options?: CatalogSyncOptions
): Promise<CatalogSyncResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const syncProducts: SyncCatalogProduct[] = [];
  const now = new Date().toISOString();

  try {
    const rawProducts = await listCatalogProducts({
      sellingRegionName: options?.sellingRegionName ?? 'north_america',
      placements: options?.placements,
      limit: options?.limit ?? 100,
      offset: options?.offset,
    });

    const filteredProducts = options?.includeDiscontinued
      ? rawProducts
      : rawProducts.filter(p => !p.is_discontinued);

    for (const rawProduct of filteredProducts) {
      try {
        const syncProduct = await normalizeCatalogProduct(rawProduct, {
          sellingRegionName: options?.sellingRegionName,
          currency: options?.currency,
        });
        syncProducts.push(syncProduct);
      } catch (err) {
        errors.push(
          'Failed to sync product ' + rawProduct.id + ' (' + rawProduct.name + '): ' +
          (err instanceof Error ? err.message : 'Unknown error')
        );
      }
    }
  } catch (err) {
    errors.push(
      'Catalog fetch failed: ' +
      (err instanceof Error ? err.message : 'Unknown error')
    );
  }

  const totalVariants = syncProducts.reduce(
    (sum, p) => sum + p.variants.length, 0
  );

  return {
    success: errors.length === 0,
    products: syncProducts,
    syncedAt: now,
    durationMs: Date.now() - startedAt,
    totalProducts: syncProducts.length,
    totalVariants,
    errors,
    source: 'printful',
  };
}

/**
 * Normalize a raw PrintfulCatalogProduct into a SyncCatalogProduct,
 * fetching its variants and pricing data.
 */
export async function normalizeCatalogProduct(
  rawProduct: RawPrintfulProduct,
  options?: {
    readonly sellingRegionName?: string;
    readonly currency?: string;
  }
): Promise<SyncCatalogProduct> {
  const now = new Date().toISOString();
  const rawVariants = await listCatalogVariants(rawProduct.id);

  // Fetch pricing for the first variant to get product-level cost data
  let productCost: SyncProductCost | null = null;
  if (rawVariants.length > 0) {
    try {
      const prices = await getCatalogVariantPrices(rawVariants[0].id, {
        currency: options?.currency ?? 'USD',
        sellingRegionName: options?.sellingRegionName ?? 'north_america',
      });
      productCost = normalizeProductCost(prices, now);
    } catch {
      // Pricing fetch failure - still include the product without cost data
    }
  }

  const variants: SyncCatalogVariant[] = rawVariants.map(rawVariant => ({
    catalogVariantId: rawVariant.id,
    catalogProductId: rawVariant.catalog_product_id,
    name: rawVariant.name,
    size: rawVariant.size ?? null,
    color: rawVariant.color ?? null,
    colorCode: rawVariant.color_code ?? null,
    image: rawVariant.image ?? null,
    cost: null,
  }));

  return {
    catalogProductId: rawProduct.id,
    name: rawProduct.name,
    type: rawProduct.type ?? null,
    brand: rawProduct.brand ?? null,
    model: rawProduct.model ?? null,
    image: rawProduct.image ?? null,
    isDiscontinued: rawProduct.is_discontinued ?? false,
    variants,
    cost: productCost,
    syncedAt: now,
  };
}

/**
 * Normalize a PrintfulCatalogVariantPrices response into SyncProductCost.
 */
export function normalizeProductCost(
  prices: PrintfulCatalogVariantPrices,
  fetchedAt?: string
): SyncProductCost {
  const now = fetchedAt ?? new Date().toISOString();

  const placements: SyncPlacementCost[] = (prices.product.placements ?? []).map(
    placement => ({
      placementId: placement.id,
      title: placement.title ?? null,
      type: placement.type ?? null,
      priceCents: parseCents(placement.price),
      discountedPriceCents: parseCents(placement.discounted_price),
      techniqueKey: placement.technique_key ?? null,
    })
  );

  const allPriceCents = placements
    .map(p => p.discountedPriceCents ?? p.priceCents)
    .filter((c): c is number => c !== null);

  return {
    currency: prices.currency,
    placements,
    minProductCostCents: allPriceCents.length > 0 ? Math.min(...allPriceCents) : 0,
    maxProductCostCents: allPriceCents.length > 0 ? Math.max(...allPriceCents) : 0,
    costSource: 'printful',
    fetchedAt: now,
  };
}

/**
 * Refresh cost data for a specific catalog product.
 * Fetches the latest pricing from Printful and returns normalized cost data.
 */
export async function refreshProductCosts(
  catalogProductId: number,
  options?: {
    readonly currency?: string;
    readonly sellingRegionName?: string;
  }
): Promise<SyncProductCost | null> {
  if (!isPrintfulConfigured()) {
    const mockProduct = MOCK_CATALOG_PRODUCTS.find(
      p => p.catalogProductId === catalogProductId
    );
    return mockProduct?.cost ?? null;
  }

  try {
    const product = await getCatalogProduct(catalogProductId);
    const variants = await listCatalogVariants(product.id);

    if (variants.length === 0) return null;

    const prices = await getCatalogVariantPrices(variants[0].id, {
      currency: options?.currency ?? 'USD',
      sellingRegionName: options?.sellingRegionName ?? 'north_america',
    });

    return normalizeProductCost(prices);
  } catch {
    // Fall back to mock data if real fetch fails
    const mockProduct = MOCK_CATALOG_PRODUCTS.find(
      p => p.catalogProductId === catalogProductId
    );
    return mockProduct?.cost ?? null;
  }
}

// ---------------------------------------------------------------------------
// Public API - Query Functions
// ---------------------------------------------------------------------------

/**
 * Find a product in the catalog (from live data or mock cache).
 */
export async function findCatalogProduct(
  productId: number
): Promise<SyncCatalogProduct | null> {
  if (!isPrintfulConfigured()) {
    return MOCK_CATALOG_PRODUCTS.find(p => p.catalogProductId === productId) ?? null;
  }

  try {
    const rawProduct = await getCatalogProduct(productId);
    return normalizeCatalogProduct(rawProduct);
  } catch {
    return MOCK_CATALOG_PRODUCTS.find(p => p.catalogProductId === productId) ?? null;
  }
}

/**
 * Get cost data for a specific product.
 * Returns cost information from the live API or mock data.
 */
export async function getProductCostData(
  catalogProductId: number,
  options?: {
    readonly currency?: string;
    readonly sellingRegionName?: string;
  }
): Promise<SyncProductCost | null> {
  return refreshProductCosts(catalogProductId, options);
}

/**
 * Check whether catalog cost data is fresh enough for live selling.
 * Returns true if the cost was fetched within the given max age.
 */
export function isCostDataFresh(
  cost: SyncProductCost | null | undefined,
  maxAgeMs: number = 24 * 60 * 60 * 1000
): boolean {
  if (!cost) return false;
  const fetchedAt = new Date(cost.fetchedAt).getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  return Date.now() - fetchedAt < maxAgeMs;
}

/**
 * Get the best available cost estimate for a product in cents.
 * Prefers discounted prices, falls back to full prices.
 */
export function getBestCostEstimateCents(
  cost: SyncProductCost | null | undefined
): number | null {
  if (!cost) return null;
  const prices = cost.placements
    .map(p => p.discountedPriceCents ?? p.priceCents)
    .filter((c): c is number => c !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { isPrintfulConfigured };
