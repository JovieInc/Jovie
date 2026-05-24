import { sql as drizzleSql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { chatConversations, chatTurns } from './chat';
import {
  currencyCodeEnum,
  merchCardStatusEnum,
  merchDesignLaneEnum,
  merchDesignOptionStatusEnum,
  merchFulfillmentJobStatusEnum,
  merchGenerationStatusEnum,
  merchOrderStatusEnum,
  merchPayoutStatusEnum,
  merchTechniqueEnum,
} from './enums';
import { creatorProfiles } from './profiles';

export interface MerchArtistBrief {
  artist_myth: string;
  fan_identity: string;
  visual_language: string[];
  forbidden_cliches: string[];
  campaign_context: string;
  best_merch_hypothesis: string;
  commercial_angle: string;
  risk_level: 'safe' | 'medium' | 'experimental';
}

export interface MerchVariantMap {
  [key: string]: number;
}

export interface MerchPricingSnapshot {
  currency: 'USD';
  retailPriceCents: number;
  estimatedPrintfulProductCostCents: number;
  estimatedShippingCostCents: number;
  stripeFeeEstimateCents: number;
  refundReserveCents: number;
  artistRoyaltyRateBps: number;
  artistPayoutPerUnitEstimateCents: number;
  jovieMarginPerUnitEstimateCents: number;
}

export interface MerchPrintfulSnapshot {
  catalogProductId: number;
  catalogVariantIds: number[];
  variantMap: MerchVariantMap;
  placements: string[];
  techniques: Array<
    'dtg' | 'embroidery' | 'cut_and_sew' | 'sublimation' | 'other'
  >;
  printFileUrls: string[];
  availabilityRegion: string;
  shippingProfile: string;
}

export interface MerchLearningSnapshot {
  styleLane: string;
  typographyStyle: string;
  graphicDensity: 'minimal' | 'medium' | 'maximal';
  garmentColor: string;
  motifs: string[];
  selectedOverOptionIds: string[];
  rejectedAttributes: string[];
}

export interface MerchVisibilityRules {
  public: boolean;
  fanSegments: string[];
  geoRules: string[];
  inventoryRules: string[];
}

export interface MerchShippingAddress {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
}

export const merchGenerationBatches = pgTable(
  'merch_generation_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    createdByClerkUserId: text('created_by_clerk_user_id').notNull(),
    chatConversationId: uuid('chat_conversation_id').references(
      () => chatConversations.id,
      { onDelete: 'set null' }
    ),
    chatTurnId: uuid('chat_turn_id').references(() => chatTurns.id, {
      onDelete: 'set null',
    }),
    prompt: text('prompt').notNull(),
    command: text('command').notNull().default('create_merch'),
    artistBrief: jsonb('artist_brief').$type<MerchArtistBrief>().notNull(),
    status: merchGenerationStatusEnum('status').notNull().default('generating'),
    error: text('error'),
    selectedOptionId: uuid('selected_option_id').references(
      (): AnyPgColumn => merchDesignOptions.id,
      { onDelete: 'set null' }
    ),
    selectedMerchCardId: uuid('selected_merch_card_id').references(
      (): AnyPgColumn => merchCards.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    creatorCreatedIdx: index('merch_generation_batches_creator_created_idx').on(
      table.creatorProfileId,
      table.createdAt
    ),
    statusCreatedIdx: index('merch_generation_batches_status_created_idx').on(
      table.status,
      table.createdAt
    ),
  })
);

export const merchDesignOptions = pgTable(
  'merch_design_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationBatchId: uuid('generation_batch_id')
      .notNull()
      .references(() => merchGenerationBatches.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    optionNumber: integer('option_number').notNull(),
    status: merchDesignOptionStatusEnum('status')
      .notNull()
      .default('candidate'),
    designLane: merchDesignLaneEnum('design_lane').notNull(),
    designName: text('design_name').notNull(),
    productType: text('product_type').notNull(),
    printfulProductName: text('printful_product_name').notNull(),
    printfulCatalogProductId: integer('printful_catalog_product_id').notNull(),
    printfulCatalogVariantIds: integer('printful_catalog_variant_ids')
      .array()
      .notNull()
      .default([]),
    variantMap: jsonb('variant_map').$type<MerchVariantMap>().notNull(),
    colorway: text('colorway').notNull(),
    availableSizes: text('available_sizes').array().notNull().default([]),
    placements: text('placements').array().notNull().default([]),
    technique: merchTechniqueEnum('technique').notNull().default('dtg'),
    retailPriceCents: integer('retail_price_cents').notNull(),
    estimatedPrintfulProductCostCents: integer(
      'estimated_printful_product_cost_cents'
    ).notNull(),
    estimatedShippingCostCents: integer('estimated_shipping_cost_cents')
      .notNull()
      .default(0),
    estimatedGrossMarginCents: integer('estimated_gross_margin_cents')
      .notNull()
      .default(0),
    artistShareCents: integer('artist_share_cents').notNull().default(0),
    jovieShareCents: integer('jovie_share_cents').notNull().default(0),
    pricing: jsonb('pricing').$type<MerchPricingSnapshot>().notNull(),
    concept: text('concept').notNull(),
    whyItFits: text('why_it_fits').notNull(),
    mockupUrls: text('mockup_urls').array().notNull().default([]),
    printFileUrls: text('print_file_urls').array().notNull().default([]),
    productionWarnings: text('production_warnings')
      .array()
      .notNull()
      .default([]),
    qualityReview: jsonb('quality_review')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    learning: jsonb('learning').$type<MerchLearningSnapshot>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    batchOptionUnique: uniqueIndex(
      'merch_design_options_batch_option_unique'
    ).on(table.generationBatchId, table.optionNumber),
    creatorStatusIdx: index('merch_design_options_creator_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
  })
);

export const merchCards = pgTable(
  'merch_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    createdByClerkUserId: text('created_by_clerk_user_id').notNull(),
    selectedDesignOptionId: uuid('selected_design_option_id').references(
      () => merchDesignOptions.id,
      { onDelete: 'set null' }
    ),
    status: merchCardStatusEnum('status').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    productType: text('product_type').notNull(),
    primaryImageUrl: text('primary_image_url').notNull(),
    mockupUrls: text('mockup_urls').array().notNull().default([]),
    printful: jsonb('printful').$type<MerchPrintfulSnapshot>().notNull(),
    currency: currencyCodeEnum('currency').notNull().default('USD'),
    retailPriceCents: integer('retail_price_cents').notNull(),
    estimatedPrintfulProductCostCents: integer(
      'estimated_printful_product_cost_cents'
    ).notNull(),
    estimatedShippingCostCents: integer('estimated_shipping_cost_cents')
      .notNull()
      .default(0),
    platformFeeCents: integer('platform_fee_cents').notNull().default(0),
    artistRoyaltyRateBps: integer('artist_royalty_rate_bps')
      .notNull()
      .default(5000),
    artistPayoutPerUnitEstimateCents: integer(
      'artist_payout_per_unit_estimate_cents'
    )
      .notNull()
      .default(0),
    jovieMarginPerUnitEstimateCents: integer(
      'jovie_margin_per_unit_estimate_cents'
    )
      .notNull()
      .default(0),
    pricing: jsonb('pricing').$type<MerchPricingSnapshot>().notNull(),
    rankScore: integer('rank_score').notNull().default(0),
    position: integer('position'),
    pinned: boolean('pinned').notNull().default(false),
    visibilityRules: jsonb('visibility_rules')
      .$type<MerchVisibilityRules>()
      .notNull()
      .default({
        public: true,
        fanSegments: [],
        geoRules: [],
        inventoryRules: [],
      }),
    views: integer('views').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    addToCarts: integer('add_to_carts').notNull().default(0),
    purchases: integer('purchases').notNull().default(0),
    grossRevenueCents: integer('gross_revenue_cents').notNull().default(0),
    grossMarginCents: integer('gross_margin_cents').notNull().default(0),
    artistPayoutAccruedCents: integer('artist_payout_accrued_cents')
      .notNull()
      .default(0),
    learning: jsonb('learning').$type<MerchLearningSnapshot>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    publishedAt: timestamp('published_at'),
    pausedAt: timestamp('paused_at'),
    archivedAt: timestamp('archived_at'),
  },
  table => ({
    creatorStatusRankIdx: index('merch_cards_creator_status_rank_idx').on(
      table.creatorProfileId,
      table.status,
      table.rankScore
    ),
    liveCardsIdx: index('merch_cards_live_idx')
      .on(table.creatorProfileId, table.rankScore)
      .where(drizzleSql`status = 'live'`),
  })
);

export const merchOrders = pgTable(
  'merch_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    merchCardId: uuid('merch_card_id')
      .notNull()
      .references(() => merchCards.id, { onDelete: 'restrict' }),
    status: merchOrderStatusEnum('status')
      .notNull()
      .default('checkout_created'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    stripeChargeId: text('stripe_charge_id'),
    printfulOrderId: text('printful_order_id').unique(),
    printfulExternalId: text('printful_external_id').unique(),
    printfulStatus: text('printful_status'),
    selectedVariantId: integer('selected_variant_id').notNull(),
    selectedVariantKey: text('selected_variant_key').notNull(),
    quantity: integer('quantity').notNull().default(1),
    buyerEmail: text('buyer_email'),
    buyerName: text('buyer_name'),
    shippingAddress: jsonb('shipping_address').$type<MerchShippingAddress>(),
    currency: currencyCodeEnum('currency').notNull().default('USD'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    stripeFeeEstimateCents: integer('stripe_fee_estimate_cents')
      .notNull()
      .default(0),
    printfulProductCostCents: integer('printful_product_cost_cents')
      .notNull()
      .default(0),
    printfulShippingCostCents: integer('printful_shipping_cost_cents')
      .notNull()
      .default(0),
    refundReserveCents: integer('refund_reserve_cents').notNull().default(0),
    artistPayoutEstimateCents: integer('artist_payout_estimate_cents')
      .notNull()
      .default(0),
    jovieShareEstimateCents: integer('jovie_share_estimate_cents')
      .notNull()
      .default(0),
    error: text('error'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    paidAt: timestamp('paid_at'),
    fulfilledAt: timestamp('fulfilled_at'),
    shippedAt: timestamp('shipped_at'),
    deliveredAt: timestamp('delivered_at'),
    refundedAt: timestamp('refunded_at'),
  },
  table => ({
    cardCreatedIdx: index('merch_orders_card_created_idx').on(
      table.merchCardId,
      table.createdAt
    ),
    creatorStatusIdx: index('merch_orders_creator_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
  })
);

export const merchPayoutLedgerEntries = pgTable(
  'merch_payout_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    merchOrderId: uuid('merch_order_id')
      .notNull()
      .references(() => merchOrders.id, { onDelete: 'restrict' })
      .unique(),
    merchCardId: uuid('merch_card_id')
      .notNull()
      .references(() => merchCards.id, { onDelete: 'restrict' }),
    grossSaleCents: integer('gross_sale_cents').notNull(),
    taxCollectedCents: integer('tax_collected_cents').notNull().default(0),
    shippingCollectedCents: integer('shipping_collected_cents')
      .notNull()
      .default(0),
    stripeFeeEstimateCents: integer('stripe_fee_estimate_cents')
      .notNull()
      .default(0),
    printfulProductCostCents: integer('printful_product_cost_cents')
      .notNull()
      .default(0),
    printfulShippingCostCents: integer('printful_shipping_cost_cents')
      .notNull()
      .default(0),
    refundReserveCents: integer('refund_reserve_cents').notNull().default(0),
    netProfitEstimateCents: integer('net_profit_estimate_cents')
      .notNull()
      .default(0),
    artistShareCents: integer('artist_share_cents').notNull().default(0),
    jovieShareCents: integer('jovie_share_cents').notNull().default(0),
    payoutStatus: merchPayoutStatusEnum('payout_status')
      .notNull()
      .default('held_for_refund_window'),
    payoutBatchId: text('payout_batch_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    readyAt: timestamp('ready_at'),
    paidAt: timestamp('paid_at'),
    reversedAt: timestamp('reversed_at'),
  },
  table => ({
    creatorStatusIdx: index('merch_payout_creator_status_idx').on(
      table.creatorProfileId,
      table.payoutStatus
    ),
  })
);

export const merchFulfillmentJobs = pgTable(
  'merch_fulfillment_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchOrderId: uuid('merch_order_id')
      .notNull()
      .references(() => merchOrders.id, { onDelete: 'cascade' })
      .unique(),
    status: merchFulfillmentJobStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    nextRunAt: timestamp('next_run_at').defaultNow().notNull(),
    lockedAt: timestamp('locked_at'),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    statusNextRunIdx: index('merch_fulfillment_jobs_status_next_run_idx').on(
      table.status,
      table.nextRunAt
    ),
  })
);

export const insertMerchGenerationBatchSchema = createInsertSchema(
  merchGenerationBatches
);
export const selectMerchGenerationBatchSchema = createSelectSchema(
  merchGenerationBatches
);
export const insertMerchDesignOptionSchema =
  createInsertSchema(merchDesignOptions);
export const selectMerchDesignOptionSchema =
  createSelectSchema(merchDesignOptions);
export const insertMerchCardSchema = createInsertSchema(merchCards);
export const selectMerchCardSchema = createSelectSchema(merchCards);
export const insertMerchOrderSchema = createInsertSchema(merchOrders);
export const selectMerchOrderSchema = createSelectSchema(merchOrders);
export const insertMerchPayoutLedgerEntrySchema = createInsertSchema(
  merchPayoutLedgerEntries
);
export const selectMerchPayoutLedgerEntrySchema = createSelectSchema(
  merchPayoutLedgerEntries
);
export const insertMerchFulfillmentJobSchema =
  createInsertSchema(merchFulfillmentJobs);
export const selectMerchFulfillmentJobSchema =
  createSelectSchema(merchFulfillmentJobs);

export type MerchGenerationBatch = typeof merchGenerationBatches.$inferSelect;
export type NewMerchGenerationBatch =
  typeof merchGenerationBatches.$inferInsert;
export type MerchDesignOption = typeof merchDesignOptions.$inferSelect;
export type NewMerchDesignOption = typeof merchDesignOptions.$inferInsert;
export type MerchCard = typeof merchCards.$inferSelect;
export type NewMerchCard = typeof merchCards.$inferInsert;
export type MerchOrder = typeof merchOrders.$inferSelect;
export type NewMerchOrder = typeof merchOrders.$inferInsert;
export type MerchPayoutLedgerEntry =
  typeof merchPayoutLedgerEntries.$inferSelect;
export type NewMerchPayoutLedgerEntry =
  typeof merchPayoutLedgerEntries.$inferInsert;
export type MerchFulfillmentJob = typeof merchFulfillmentJobs.$inferSelect;
export type NewMerchFulfillmentJob = typeof merchFulfillmentJobs.$inferInsert;
