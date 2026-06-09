import 'server-only';

import type { MerchVariantMap } from '@/lib/db/schema/merch';

export interface MockupCatalogProduct {
  readonly catalogProductId: number;
  readonly productName: string;
  readonly productType: string;
  readonly colorway: string;
  readonly variantMap: MerchVariantMap;
  readonly catalogVariantIds: number[];
  readonly placements: string[];
  readonly technique:
    | 'dtg'
    | 'embroidery'
    | 'cut_and_sew'
    | 'sublimation'
    | 'other';
}

/**
 * Pre-configured Printful products for photorealistic mockup generation.
 * These are distinct from the single-item `MERCH_DEFAULT_PRINTFUL_PRODUCT` used
 * for production ordering — this catalog exists purely for mockup rendering.
 */
export const MOCKUP_CATALOG_PRODUCTS: MockupCatalogProduct[] = [
  {
    catalogProductId: 71,
    productName: 'Unisex Premium T-Shirt',
    productType: 'premium tee',
    colorway: 'black',
    variantMap: {
      S_black: 4011,
      M_black: 4012,
      L_black: 4013,
      XL_black: 4014,
    } satisfies MerchVariantMap,
    catalogVariantIds: [4011, 4012, 4013, 4014],
    placements: ['front'],
    technique: 'dtg',
  },
  {
    catalogProductId: 194,
    productName: 'Unisex Premium Hoodie',
    productType: 'premium hoodie',
    colorway: 'black',
    variantMap: {
      S_black: 7370,
      M_black: 7371,
      L_black: 7372,
      XL_black: 7373,
    } satisfies MerchVariantMap,
    catalogVariantIds: [7370, 7371, 7372, 7373],
    placements: ['front'],
    technique: 'dtg',
  },
  {
    catalogProductId: 19,
    productName: 'White Glossy Mug 11oz',
    productType: 'mug',
    colorway: 'white',
    variantMap: {
      white_11oz: 50,
    } satisfies MerchVariantMap,
    catalogVariantIds: [50],
    placements: ['front'],
    technique: 'other',
  },
];

export function getMockupProductsForTypes(
  productTypes: readonly string[]
): MockupCatalogProduct[] {
  if (productTypes.length === 0) {
    return MOCKUP_CATALOG_PRODUCTS;
  }
  const typeSet = new Set(productTypes.map(t => t.toLowerCase()));
  return MOCKUP_CATALOG_PRODUCTS.filter(p =>
    typeSet.has(p.productType.toLowerCase())
  );
}

export function getMockupCatalogProduct(
  catalogProductId: number
): MockupCatalogProduct | undefined {
  return MOCKUP_CATALOG_PRODUCTS.find(
    p => p.catalogProductId === catalogProductId
  );
}
