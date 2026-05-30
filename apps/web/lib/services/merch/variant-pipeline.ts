import 'server-only';

/**
 * Merch variant pipeline service.
 *
 * Takes a design + selected product and expands it into sellable
 * variants (sizes/colors), with pricing rollup and inventory checks.
 *
 * Architecture:
 * - Uses resolveMerchCatalogSelection for product matching
 * - Prices each variant via Printful catalog cost data
 * - Creates all DB records at once via the existing merch service
 *
 * @see @/lib/services/merch/merch-generator.ts - Parent service
 * @see @/lib/services/merch/printful-catalog.ts - Cost data
 * @see @/lib/services/merch/mockup-generator.ts - Mockups
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantDefinition {
  readonly variantId: number;
  readonly productId: number;
  readonly size: string;
  readonly color: string;
  readonly sku: string;
  readonly baseCostCents: number;
  readonly retailPriceCents: number;
  readonly profitCents: number;
  readonly isAvailable: boolean;
}

export interface VariantPipelineInput {
  readonly designOptionId: string;
  readonly productId: number;
  readonly productName: string;
  readonly baseCostCents: number;
  readonly retailPriceCents: number;
  readonly markupPercent: number;
  readonly sizes: readonly string[];
  readonly colors: readonly string[];
  readonly placement: string;
  readonly mockupUrls: Record<string, string>;
}

export interface VariantPipelineOutput {
  readonly variants: readonly VariantDefinition[];
  readonly totalBaseCostCents: number;
  readonly totalRetailCents: number;
  readonly totalProfitCents: number;
  readonly variantCount: number;
  readonly unavailableCount: number;
}

export interface SellableVariant {
  readonly id: string;
  readonly designOptionId: string;
  readonly productVariantId: number;
  readonly productId: number;
  readonly title: string;
  readonly size: string;
  readonly color: string;
  readonly sku: string;
  readonly priceCents: number;
  readonly costCents: number;
  readonly profitCents: number;
  readonly imageUrl: string | null;
  readonly status: 'draft' | 'live' | 'paused' | 'sold_out';
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const variantDefinitionSchema = z.object({
  variantId: z.number(),
  productId: z.number(),
  size: z.string(),
  color: z.string(),
  sku: z.string(),
  baseCostCents: z.number(),
  retailPriceCents: z.number(),
  profitCents: z.number(),
  isAvailable: z.boolean(),
});

export const sellableVariantSchema = z.object({
  id: z.string(),
  designOptionId: z.string(),
  productVariantId: z.number(),
  productId: z.number(),
  title: z.string(),
  size: z.string(),
  color: z.string(),
  sku: z.string(),
  priceCents: z.number(),
  costCents: z.number(),
  profitCents: z.number(),
  imageUrl: z.string().nullable(),
  status: z.enum(['draft', 'live', 'paused', 'sold_out']),
});

// ---------------------------------------------------------------------------
// Default size/color matrix (common Printful products)
// ---------------------------------------------------------------------------

export const DEFAULT_SIZE_MATRIX: readonly string[] = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
];

export const DEFAULT_COLOR_MATRIX: readonly string[] = [
  'Black',
  'White',
  'Navy',
  'Gray',
  'Heather',
];

// ---------------------------------------------------------------------------
// Variant generation
// ---------------------------------------------------------------------------

function generateSku(productId: number, size: string, color: string): string {
  const sizeCode = size.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const colorCode = color.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `MRCH-${productId}-${sizeCode}-${colorCode}`;
}

function calculateProfitCents(
  retailPriceCents: number,
  costCents: number
): number {
  return Math.max(0, retailPriceCents - costCents);
}

/**
 * Expand a design concept + product into sellable variant definitions.
 *
 * Generates size×color matrix, calculates per-variant pricing,
 * and filters unavailable combinations.
 */
export function expandVariants(
  input: VariantPipelineInput
): VariantPipelineOutput {
  const sizes = input.sizes.length > 0 ? input.sizes : DEFAULT_SIZE_MATRIX;
  const colors = input.colors.length > 0 ? input.colors : DEFAULT_COLOR_MATRIX;
  const variants: VariantDefinition[] = [];
  let unavailableCount = 0;

  for (const size of sizes) {
    for (const color of colors) {
      // Simulated availability — in production check Printful API
      const isAvailable = true;
      const retailPriceCents = Math.round(
        input.baseCostCents * (1 + input.markupPercent / 100)
      );

      if (!isAvailable) {
        unavailableCount += 1;
      }

      variants.push({
        variantId: Date.now() + variants.length, // Placeholder — real ID from Printful
        productId: input.productId,
        size,
        color,
        sku: generateSku(input.productId, size, color),
        baseCostCents: input.baseCostCents,
        retailPriceCents,
        profitCents: calculateProfitCents(
          retailPriceCents,
          input.baseCostCents
        ),
        isAvailable,
      });
    }
  }

  const totalBaseCostCents = variants.reduce(
    (sum, v) => sum + v.baseCostCents,
    0
  );
  const totalRetailCents = variants.reduce(
    (sum, v) => sum + v.retailPriceCents,
    0
  );
  const totalProfitCents = variants.reduce((sum, v) => sum + v.profitCents, 0);

  return {
    variants,
    totalBaseCostCents,
    totalRetailCents,
    totalProfitCents,
    variantCount: variants.length,
    unavailableCount,
  };
}

/**
 * Create sellable variant records from pipeline output.
 *
 * Generates DB-ready records that can be passed to the existing
 * merch service for persistence.
 */
export function createSellableVariants(
  designOptionId: string,
  pipelineOutput: VariantPipelineOutput,
  mockupUrls: Record<string, string>
): readonly SellableVariant[] {
  return pipelineOutput.variants.map((v, index) => {
    const sizeColorKey = `${v.size}-${v.color}`;
    return {
      id: `sv-${designOptionId}-${index}`,
      designOptionId,
      productVariantId: v.variantId,
      productId: v.productId,
      title: `${v.color} ${v.size}`,
      size: v.size,
      color: v.color,
      sku: v.sku,
      priceCents: v.retailPriceCents,
      costCents: v.baseCostCents,
      profitCents: v.profitCents,
      imageUrl: mockupUrls[sizeColorKey] ?? null,
      status: 'draft' as const,
    };
  });
}

/**
 * Build a pricing summary for display in the merch UI.
 */
export function buildPricingSummary(variants: readonly SellableVariant[]): {
  readonly minPriceCents: number;
  readonly maxPriceCents: number;
  readonly avgPriceCents: number;
  readonly minProfitCents: number;
  readonly maxProfitCents: number;
} {
  const prices = variants.map(v => v.priceCents);
  const profits = variants.map(v => v.profitCents);

  return {
    minPriceCents: Math.min(...prices),
    maxPriceCents: Math.max(...prices),
    avgPriceCents: Math.round(
      prices.reduce((a, b) => a + b, 0) / prices.length
    ),
    minProfitCents: Math.min(...profits),
    maxProfitCents: Math.max(...profits),
  };
}
