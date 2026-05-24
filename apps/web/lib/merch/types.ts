import type {
  MerchArtistBrief,
  MerchCard,
  MerchDesignOption,
  MerchLearningSnapshot,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
  MerchShippingAddress,
  MerchVariantMap,
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
    readonly retail_price: string;
    readonly estimated_printful_cost: string;
    readonly estimated_shipping: string;
    readonly estimated_gross_margin: string;
    readonly artist_share: string;
    readonly jovie_share: string;
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
};
