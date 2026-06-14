import 'server-only';

import type {
  MerchPricingSnapshot,
  MerchVariantMap,
} from '@/lib/db/schema/merch';
import {
  getCatalogProduct,
  getCatalogProductAvailability,
  getCatalogVariantPrices,
  isPrintfulConfigured,
  listCatalogProducts,
  listCatalogVariants,
  type PrintfulCatalogProduct,
  type PrintfulCatalogVariant,
  type PrintfulCatalogVariantPrices,
} from '@/lib/printful/client';
import {
  getDefaultVariantIds,
  MERCH_DEFAULT_PRINTFUL_PRODUCT,
} from './default-catalog';
import {
  buildMerchPricingSnapshot,
  calculateRecommendedSalePriceCents,
  MERCH_DEFAULT_MARGIN_PRESET,
  MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
} from './pricing';

const CATALOG_PAGE_SIZE = 100;
const MAX_CATALOG_PRODUCTS = 500;

export interface MerchCatalogSelection {
  readonly catalogProductId: number;
  readonly productName: string;
  readonly productType: string;
  readonly colorway: string;
  readonly variantMap: MerchVariantMap;
  readonly catalogVariantIds: number[];
  readonly sizes: string[];
  readonly placements: string[];
  readonly technique:
    | 'dtg'
    | 'embroidery'
    | 'cut_and_sew'
    | 'sublimation'
    | 'other';
  readonly availabilityRegion: string;
  readonly shippingProfile: string;
  readonly pricing: MerchPricingSnapshot;
  readonly providerWarnings: string[];
}

function defaultSelection(
  providerWarnings: string[] = []
): MerchCatalogSelection {
  return {
    catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
    productName: MERCH_DEFAULT_PRINTFUL_PRODUCT.productName,
    productType: MERCH_DEFAULT_PRINTFUL_PRODUCT.productType,
    colorway: MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
    variantMap: MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap,
    catalogVariantIds: getDefaultVariantIds(),
    sizes: MERCH_DEFAULT_PRINTFUL_PRODUCT.sizes,
    placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
    technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
    availabilityRegion: MERCH_DEFAULT_PRINTFUL_PRODUCT.availabilityRegion,
    shippingProfile: MERCH_DEFAULT_PRINTFUL_PRODUCT.shippingProfile,
    pricing: buildMerchPricingSnapshot({
      retailPriceCents: calculateRecommendedSalePriceCents(
        MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
        MERCH_DEFAULT_MARGIN_PRESET,
        {
          printfulCostSource: 'jovie_default',
          printfulCostUpdatedAt: null,
        }
      ),
      printfulProductCostCents: MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
      printfulCostSource: 'jovie_default',
      printfulCostUpdatedAt: null,
    }),
    providerWarnings,
  };
}

function normalize(value: string | null | undefined): string {
  return (
    value
      ?.toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, ' ')
      .trim() ?? ''
  );
}

function productMatchesRequest(
  product: PrintfulCatalogProduct,
  request: string
): boolean {
  if (!request)
    return product.id === MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId;
  const requestTokens = request
    .split(' ')
    .filter(Boolean)
    .filter(token => token.length > 1)
    .filter(
      token =>
        ![
          'create',
          'make',
          'merch',
          'product',
          'catalog',
          'printful',
          'version',
        ].includes(token)
    );
  if (requestTokens.length === 0) {
    return product.id === MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId;
  }
  const haystack = normalize(
    [product.name, product.type, product.brand, product.model]
      .filter(Boolean)
      .join(' ')
  );
  return requestTokens.some(token => haystack.includes(token));
}

function extractCatalogProductId(request: string): number | null {
  const tokens = request.split(' ').filter(Boolean);
  for (const [index, token] of tokens.entries()) {
    const id = Number.parseInt(token, 10);
    const isCatalogSizedNumber =
      String(id) === token && token.length >= 2 && token.length <= 6;
    if (!isCatalogSizedNumber || id <= 0) continue;

    const context = tokens.slice(Math.max(0, index - 4), index);
    const hasProductWord = context.some(item =>
      ['product', 'item', 'sku'].includes(item)
    );
    const hasCatalogWord = context.some(item =>
      ['catalog', 'printful'].includes(item)
    );
    if (hasProductWord || hasCatalogWord) {
      return id;
    }
  }

  return null;
}

async function listCatalogProductsForSelection(): Promise<
  PrintfulCatalogProduct[]
> {
  const products: PrintfulCatalogProduct[] = [];

  for (
    let offset = 0;
    offset < MAX_CATALOG_PRODUCTS;
    offset += CATALOG_PAGE_SIZE
  ) {
    const page = await listCatalogProducts({
      sellingRegionName: 'north_america',
      placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
      limit: CATALOG_PAGE_SIZE,
      offset,
    });
    products.push(...page);

    if (page.length < CATALOG_PAGE_SIZE) break;
  }

  return products;
}

async function resolveRequestedCatalogProduct(
  request: string
): Promise<PrintfulCatalogProduct | null> {
  const requestedProductId = extractCatalogProductId(request);
  if (!requestedProductId) return null;

  const product = await getCatalogProduct(requestedProductId);
  if (product.is_discontinued) {
    throw new Error(
      `Printful catalog product ${requestedProductId} is discontinued`
    );
  }
  return product;
}

function variantKey(variant: PrintfulCatalogVariant, index: number): string {
  const size = normalize(variant.size) || `variant_${index + 1}`;
  const color = normalize(variant.color) || 'default';
  return `${size}_${color}`.replaceAll(/\s+/g, '_');
}

function parsePrintfulMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function parsePrintfulPriceCents(
  prices: PrintfulCatalogVariantPrices,
  placementIds: readonly string[],
  techniqueKey: string
): number | null {
  const placement = prices.product.placements.find(item =>
    placementIds.includes(item.id)
  );
  const technique = prices.variant?.techniques?.find(
    item => item.technique_key === techniqueKey
  );
  const placementPrice = parsePrintfulMoney(
    placement?.discounted_price ?? placement?.price
  );
  const techniquePrice = parsePrintfulMoney(
    technique?.discounted_price ?? technique?.price
  );
  if (placementPrice === null && techniquePrice === null) return null;
  return (placementPrice ?? 0) + (techniquePrice ?? 0);
}

function selectVariants(
  variants: readonly PrintfulCatalogVariant[]
): readonly PrintfulCatalogVariant[] {
  const active = variants.filter(variant => variant.id > 0);
  const black = active.filter(variant =>
    normalize(variant.color || variant.name).includes('black')
  );
  const source = black.length > 0 ? black : active;
  return source.slice(0, 4);
}

export async function resolveMerchCatalogSelection(
  itemRequest: string | null | undefined
): Promise<MerchCatalogSelection> {
  if (!isPrintfulConfigured()) {
    return defaultSelection([
      'Printful is not configured; generated merch is draft-only.',
    ]);
  }

  try {
    const request = normalize(itemRequest);
    const requestedProduct = await resolveRequestedCatalogProduct(request);
    const products = requestedProduct
      ? [requestedProduct]
      : await listCatalogProductsForSelection();
    const product =
      products.find(
        item => !item.is_discontinued && productMatchesRequest(item, request)
      ) ??
      products.find(
        item => item.id === MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId
      ) ??
      products.find(item => !item.is_discontinued);
    if (!product) {
      throw new Error('Printful catalog did not return an eligible product');
    }

    const variants = selectVariants(await listCatalogVariants(product.id));
    if (variants.length === 0) {
      throw new Error('Printful catalog product has no eligible variants');
    }

    const variantMap = variants.reduce<MerchVariantMap>(
      (map, variant, index) => {
        map[variantKey(variant, index)] = variant.id;
        return map;
      },
      {}
    );
    const prices = await getCatalogVariantPrices(variants[0].id, {
      currency: 'USD',
      sellingRegionName: 'north_america',
    });
    const productCostCents = parsePrintfulPriceCents(
      prices,
      MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
      MERCH_DEFAULT_PRINTFUL_PRODUCT.technique
    );
    if (!productCostCents) {
      throw new Error('Printful did not return a usable product cost');
    }

    const availability = await getCatalogProductAvailability(
      product.id,
      'north_america'
    );
    const availabilityWarnings =
      availability.length > 0
        ? variants.flatMap(variant => {
            const row = availability.find(
              item => item.catalog_variant_id === variant.id
            );
            const available = row?.techniques?.some(technique =>
              technique.selling_regions?.some(
                region =>
                  region.name === 'north_america' &&
                  region.availability.toLowerCase() === 'available'
              )
            );
            return available === false
              ? [`Printful variant ${variant.id} is not available.`]
              : [];
          })
        : [];

    return {
      catalogProductId: product.id,
      productName: product.name,
      productType: product.type ?? product.model ?? 'Printful product',
      colorway: variants[0].color ?? MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
      variantMap,
      catalogVariantIds: variants.map(variant => variant.id),
      sizes: variants.map(variant => variant.size ?? variant.name),
      placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
      technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
      availabilityRegion: MERCH_DEFAULT_PRINTFUL_PRODUCT.availabilityRegion,
      shippingProfile: MERCH_DEFAULT_PRINTFUL_PRODUCT.shippingProfile,
      pricing: buildMerchPricingSnapshot({
        retailPriceCents: calculateRecommendedSalePriceCents(
          productCostCents,
          MERCH_DEFAULT_MARGIN_PRESET,
          {
            printfulCostSource: 'printful',
            printfulCostUpdatedAt: new Date().toISOString(),
          }
        ),
        printfulProductCostCents: productCostCents,
        printfulCostSource: 'printful',
        printfulCostUpdatedAt: new Date().toISOString(),
      }),
      providerWarnings: availabilityWarnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return defaultSelection([
      `Printful catalog pricing unavailable: ${message}`,
    ]);
  }
}
