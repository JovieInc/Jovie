import 'server-only';

import type { MerchVariantMap } from '@/lib/db/schema/merch';

export const MERCH_DEFAULT_PRINTFUL_PRODUCT = {
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
  sizes: ['S', 'M', 'L', 'XL'],
  placements: ['front'],
  technique: 'dtg' as const,
  availabilityRegion: 'US',
  shippingProfile: 'printful_standard_us',
};

export function getDefaultVariantIds(): number[] {
  return Object.values(MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap);
}
