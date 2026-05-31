/**
 * Merch generator — parent generation service.
 * @see @/lib/services/merch/mockup-generator.ts
 * @see @/lib/services/merch/variant-pipeline.ts
 */

/** A design option selected for merch generation. */
export interface DesignOption {
  readonly id: string;
  readonly designId?: string;
  readonly productId?: string;
  readonly variantId?: string;
  readonly imageUrl?: string;
  readonly svgContent?: string;
  readonly concept?: string;
  readonly category?: string;
  readonly description?: string;
  readonly status?: string;
}

/** A product variant reference. */
export interface ProductVariant {
  readonly id: string;
  readonly label?: string;
  readonly imageUrl?: string;
  readonly priceCents?: number;
  readonly costCents?: number;
}

/** A selected product for merch generation. */
export interface SelectedProduct {
  readonly id: string;
  readonly productId: number;
  readonly printfulProductId?: number;
  readonly name?: string;
  readonly variants?: readonly ProductVariant[];
  readonly variantIds: number[];
  readonly baseCostCents?: number;
}

/** Merch generation request. */
export interface MerchGenerationRequest {
  readonly designOption: DesignOption;
  readonly products: readonly SelectedProduct[];
}
