import type {
  MerchArtistBrief,
  MerchCard,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
  MerchShippingAddress,
} from '@/lib/db/schema/merch';

export type MerchDesignCommand =
  | 'create_merch'
  | 'preview_merch_options'
  | 'select_merch_design'
  | 'publish_merch_card'
  | 'update_merch_card'
  | 'pause_merch_card'
  | 'unpause_merch_card'
  | 'delete_or_archive_merch_card'
  | 'reorder_merch_cards'
  | 'optimize_merch_cards'
  | 'fulfill_merch_order'
  | 'show_merch_sales'
  | 'show_artist_payouts';

export type MerchDesignLane =
  | 'band_tour_uniform'
  | 'fashion_graphic_item'
  | 'artist_world_artifact';

export interface MerchGenerationOptionView {
  readonly id: string;
  readonly option_number: number;
  readonly design_name: string;
  readonly product_type: string;
  readonly printful_product_name: string;
  readonly printful_catalog_product_id: number;
  readonly printful_variant_ids: number[];
  readonly colorway: string;
  readonly available_sizes: string[];
  readonly placements: string[];
  readonly technique:
    | 'dtg'
    | 'embroidery'
    | 'cut_and_sew'
    | 'sublimation'
    | 'other';
  readonly price_recommendation: {
    readonly sale_price: string;
    readonly profit: string;
    readonly margin_preset: 'safe' | 'standard' | 'aggressive';
    readonly presets: readonly {
      readonly preset: 'safe' | 'standard' | 'aggressive';
      readonly label: string;
      readonly sale_price: string;
      readonly profit: string;
    }[];
    readonly estimated_printful_cost?: string;
  };
  readonly sellability?: {
    readonly sellable: boolean;
    readonly reasons: readonly string[];
  };
  readonly concept: string;
  readonly why_it_fits: string;
  readonly mockup_urls: string[];
  readonly production_warnings: string[];
}

export interface MerchGenerationResult {
  readonly success: true;
  readonly generationId: string;
  readonly artistBrief: MerchArtistBrief;
  readonly options: MerchGenerationOptionView[];
  readonly prompt: string;
}

export interface MerchSelectionResult {
  readonly success: true;
  readonly merchCardId: string;
  readonly status: MerchCard['status'];
  readonly selectedOptionId: string;
  readonly title: string;
  readonly publicUrl: string | null;
  readonly publishBlockedReasons?: readonly string[];
}

// ---------------------------------------------------------------------------
// Two-phase guided merch flow contracts
//
// Phase A (design): the chat shows a carousel of product-agnostic design
// concepts rendered from the parametric archetype library. Phase B (product):
// the chosen design is composited onto a curated product+color set by the
// own-generator mockup engine. Chat-facing fields stay snake_case to match
// MerchGenerationOptionView and the ChatMerch* components.
// ---------------------------------------------------------------------------

/** Slot values filled into a design archetype. Lyric is sourced from the
 * artist's own catalog (discog_recordings/tracks.lyrics) or typed manually. */
export interface MerchDesignSlots {
  readonly artist_name: string;
  readonly short_text?: string;
  readonly lyric?: string;
  readonly year?: string;
  readonly location?: string;
  readonly tracklist?: readonly string[];
}

/** One design concept in the Phase-A carousel (product-agnostic).
 * Mirrors ThreadImageCard's discriminated union: while the image model runs the
 * design is `generating` with no preview; `preview_url` is present once `ready`. */
export interface MerchDesignPreview {
  readonly id: string;
  readonly option_number: number;
  readonly design_name: string;
  /** Which roster model produced it — stamped for feedback scoring. */
  readonly model_key?: string;
  readonly concept: string;
  readonly status: 'generating' | 'ready';
  /** Transparent (alpha) print-art preview. Present only when status is `ready`. */
  readonly preview_url?: string;
  readonly slots: MerchDesignSlots;
}

export interface MerchDesignCarouselResult {
  readonly success: true;
  readonly generationId: string;
  readonly prompt?: string;
  readonly nextStep?: string;
  readonly designs: readonly MerchDesignPreview[];
}

/** One product in the Phase-B set: the chosen design composited onto a
 * curated product in a pop color, with the instant own-generator mockup. */
export interface MerchProductApplication {
  readonly id: string;
  readonly product_type: string;
  readonly product_name: string;
  readonly color_name: string;
  readonly color_hex: string;
  /** Printful variant id for the shown color, so the order matches the mockup. */
  readonly color_variant_id: number;
  /** Plain-language reason this color/product makes the print pop. */
  readonly pop_reason: string;
  /** Instant own-generator mockup (always present — synchronous render). */
  readonly mockup_url: string;
  readonly price_recommendation: MerchGenerationOptionView['price_recommendation'];
  readonly sellability?: {
    readonly sellable: boolean;
    readonly reasons: readonly string[];
  };
}

export interface MerchProductSetResult {
  readonly success: true;
  readonly designId: string;
  readonly design_name: string;
  readonly nextStep?: string;
  readonly products: readonly MerchProductApplication[];
}

export interface PublicMerchCard {
  readonly id: string;
  readonly artistId: string;
  readonly status: MerchCard['status'];
  readonly title: string;
  readonly description: string;
  readonly productType: string;
  readonly primaryImageUrl: string;
  readonly mockupUrls: string[];
  readonly printful: MerchPrintfulSnapshot;
  readonly pricing: MerchPricingSnapshot;
  readonly retailPriceCents: number;
  readonly rankScore: number;
  readonly position: number | null;
  readonly pinned: boolean;
}

export interface LibraryMerchCard {
  readonly id: string;
  readonly status: MerchCard['status'];
  readonly title: string;
  readonly description: string;
  readonly productType: string;
  readonly primaryImageUrl: string;
  readonly mockupUrls: string[];
  readonly retailPriceCents: number;
  readonly artistPayoutPerUnitEstimateCents: number;
  readonly jovieMarginPerUnitEstimateCents: number;
  readonly sellable: boolean;
  readonly sellabilityReasons: readonly string[];
  readonly rankScore: number;
  readonly position: number | null;
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface MerchCheckoutInput {
  readonly merchCardId: string;
  readonly variantKey: string;
  readonly quantity: number;
  readonly handle: string;
}

export interface MerchCheckoutSessionResult {
  readonly url: string;
  readonly sessionId: string;
  readonly orderId: string;
}

export interface MerchOrderFulfillmentInput {
  readonly shippingAddress: MerchShippingAddress;
  readonly buyerEmail: string | null;
  readonly buyerName: string | null;
}

export type {
  MerchDesignOption,
  MerchLearningSnapshot,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
  MerchShippingAddress,
  MerchVariantMap,
} from '@/lib/db/schema/merch';
