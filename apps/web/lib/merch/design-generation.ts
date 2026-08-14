import 'server-only';

/**
 * Phase-A merch design generation — THE canonical generation pipeline for
 * chat-driven merch (JOV-4743, see `@/lib/merch/generation-contract`).
 *
 * Every chat tool entry point (`createMerch`, `previewMerchOptions`) must call
 * `generateMerchDesigns` so the versioned prompt/content contract (verified
 * source + no-person rules), the qualityReview evidence payload, and the
 * publish blockers apply identically everywhere.
 *
 * Generates N illustrated, transparent (alpha) print graphics for the artist via
 * the multi-model graphic engine, persists each as a merchDesignOption bound to
 * the default product (so the existing selectMerchDesign machinery can turn one
 * into a card), and returns the carousel result the chat renders.
 *
 * Product/color application onto a real Printful blank (the truthful mockup) is
 * Phase B — selecting a design routes through the existing selectMerchDesign.
 *
 * @see @/lib/merch/graphic-engine — the alpha graphic generator
 * @see @/lib/merch/service — selectMerchDesign (Phase B entry)
 */

import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { uploadBufferToBlob } from '@/app/api/images/upload/lib/blob-upload';
import { db } from '@/lib/db';
import {
  type MerchArtistBrief,
  merchCards,
  merchDesignOptions,
  merchGenerationBatches,
} from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import { resolveMerchCatalogSelection } from './catalog';
import {
  MERCH_CONTENT_CONTRACT_VERSION,
  MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
  type MerchContentReview,
  MerchPersonContentRejectedError,
  stampMerchContentReview,
} from './content-contract';
import {
  evaluateMerchCandidateReadiness,
  reviewMerchContent,
} from './content-review';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from './default-catalog';
import {
  MERCH_CANONICAL_PIPELINE_ID,
  MERCH_GENERATION_CONTRACT_VERSION,
  type MerchGenerationReceipt,
} from './generation-contract';
import { generatePrintGraphic } from './graphic-engine';
import { scheduleMerchMockupEnrichment } from './mockup-enrichment';
import {
  buildMerchPricingSnapshot,
  calculateRecommendedSalePriceCents,
  formatMerchMoney,
  MERCH_DEFAULT_MARGIN_PRESET,
  MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
} from './pricing';
import {
  type MerchSource,
  requiresAssetPreservingRender,
} from './source-candidates';
import type { MerchDesignCarouselResult, MerchDesignPreview } from './types';

const DEFAULT_DESIGN_COUNT = 3;

/**
 * Starts independent generation prerequisites together so rendering is not
 * delayed by unrelated profile, catalog, and preference reads.
 */
export async function resolveMerchGenerationPrerequisites<
  TArtistName,
  TCatalog,
  TModelWeights,
>(tasks: {
  readonly artistName: () => Promise<TArtistName>;
  readonly catalog: () => Promise<TCatalog>;
  readonly modelWeights: () => Promise<TModelWeights>;
}): Promise<{
  readonly artistName: TArtistName;
  readonly catalog: TCatalog;
  readonly modelWeights: TModelWeights;
}> {
  const [artistName, catalog, modelWeights] = await Promise.all([
    tasks.artistName(),
    tasks.catalog(),
    tasks.modelWeights(),
  ]);
  return { artistName, catalog, modelWeights };
}

/**
 * Each strategy deliberately occupies a different visual lane. Keep the
 * fields separate so adjective-only changes cannot collapse the options into
 * the same composition again.
 */
export interface MerchDesignStrategy {
  readonly label: string;
  readonly composition: string;
  readonly typographyRole: string;
  readonly motifSystem: string;
  readonly palette: string;
  readonly density: string;
}

export const MERCH_DESIGN_STRATEGIES: readonly MerchDesignStrategy[] = [
  {
    label: 'Signal Field',
    composition:
      'an offset left-to-right signal field with one dominant graphic band and intentional open space',
    typographyRole:
      'artist name as a small signature line, with the verified source phrase as the primary readable type',
    motifSystem:
      'abstract pulse lines, register marks, and measured signal fragments only',
    palette: 'ink black, bone, and one electric blue accent',
    density: 'medium density with a clear quiet margin',
  },
  {
    label: 'Archive Stamp',
    composition:
      'a compact centered archival seal with a broad empty outer field, not a poster layout',
    typographyRole:
      'verified source phrase set as small circular utility type, artist name as a secondary catalog credit',
    motifSystem:
      'abstract catalog notches, concentric rings, and a single geometric identifier',
    palette: 'one-color charcoal print with no secondary accent',
    density: 'minimal density with large negative space',
  },
  {
    label: 'Night Transit',
    composition:
      'a wide horizontal transit strip across the lower third, leaving the upper field deliberately empty',
    typographyRole:
      'artist name as a wide wordmark, verified source phrase as a short route label beneath it',
    motifSystem:
      'abstract route geometry, timing ticks, and directional arrows without place names or dates',
    palette: 'deep charcoal, silver gray, and restrained violet',
    density: 'medium-high density confined to the lower strip',
  },
  {
    label: 'Editorial Cut',
    composition:
      'a vertical editorial split with the image language concentrated in one narrow side column',
    typographyRole:
      'verified source phrase as the hero typographic crop, artist name as a small byline',
    motifSystem:
      'abstract crop marks, halftone texture, and one cut-paper shape',
    palette: 'black, soft white, and one muted pink accent',
    density: 'high contrast with controlled medium density',
  },
  {
    label: 'Object Study',
    composition:
      'one isolated abstract object centered low on the canvas with a large unprinted field above',
    typographyRole:
      'artist name as compact utility type, verified source phrase as a caption adjacent to the object',
    motifSystem:
      'one non-figurative geometric object built from the source phrase initials, never a logo recreation',
    palette: 'black and off-white only',
    density: 'minimal density',
  },
  {
    label: 'Type Stack',
    composition:
      'a tall stacked type system filling the center column with no illustrative scene',
    typographyRole:
      'verified source phrase and artist name share equal typographic weight in distinct lines',
    motifSystem:
      'simple rule lines and typographic spacing only, no icons or symbolic illustration',
    palette: 'ink black with one restrained orange registration mark',
    density: 'typography-dense but visually spare',
  },
];

function normalizedStrategyLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function selectMerchDesignStrategies(
  count: number,
  recentSelectedLabels: readonly string[] = []
): readonly MerchDesignStrategy[] {
  const recent = new Set(recentSelectedLabels.map(normalizedStrategyLabel));
  const fresh = MERCH_DESIGN_STRATEGIES.filter(
    strategy => !recent.has(normalizedStrategyLabel(strategy.label))
  );
  const candidates =
    fresh.length >= count
      ? fresh
      : [
          ...fresh,
          ...MERCH_DESIGN_STRATEGIES.filter(strategy =>
            recent.has(normalizedStrategyLabel(strategy.label))
          ),
        ];
  return candidates.slice(0, count);
}

async function uploadAlphaPng(path: string, buffer: Buffer): Promise<string> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    return `https://blob.vercel-storage.com/${path}`;
  }
  const url = await uploadBufferToBlob(put, path, buffer, 'image/png');
  if (!url.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }
  return url;
}

async function artistName(profileId: string): Promise<string> {
  const [profile] = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!profile) throw new Error('Creator profile not found');
  return profile.displayName?.trim() || profile.username;
}

function minimalBrief(
  name: string,
  prompt: string,
  source?: MerchSource
): MerchArtistBrief {
  return {
    artist_myth: `${name} merch.`,
    fan_identity:
      'Fans want a wearable graphic that looks designed, not generic.',
    visual_language: ['illustrated graphic', 'band-merch energy'],
    forbidden_cliches: [
      'fake tour dates',
      'generic centered logo',
      'no people, faces, portraits, models, or human figures',
      'no unverified artist likeness',
    ],
    campaign_context: `Artist request: ${prompt}`,
    best_merch_hypothesis: 'A strong illustrated graphic on a premium blank.',
    commercial_angle: 'Wearable artist graphic.',
    risk_level: 'safe',
    ...(source ? { source } : {}),
  };
}

export function buildMerchImagePrompt(
  name: string,
  userPrompt: string,
  strategy: MerchDesignStrategy,
  source: MerchSource,
  recentSelectedLabels: readonly string[] = []
): string {
  const recentLine = recentSelectedLabels.length
    ? `Do not reuse the recently selected strategy families: ${recentSelectedLabels.join(', ')}. This option must remain visibly distinct from them.`
    : '';

  return [
    `Strategy family: ${strategy.label}.`,
    `Concept: ${userPrompt}.`,
    `Use this verified ${source.sourceType.replaceAll('_', ' ')} exactly as the textual source: "${source.sourceText}". Provenance: ${source.provenanceTitle}.`,
    `Composition: ${strategy.composition}.`,
    `Typography role: ${strategy.typographyRole}.`,
    `Motif system: ${strategy.motifSystem}.`,
    `Palette: ${strategy.palette}. Density: ${strategy.density}.`,
    recentLine,
    'Print-ready artwork only, no garment and no mockup. Render no text beyond the verified source phrase and artist name. Do not depict people, faces, portraits, models, bodies, or human figures. Do not invent, imitate, or imply the artist likeness. Do not recreate logos, trademarks, lyrics, catalog facts, place names, or tour dates from a textual description.',
  ]
    .filter(Boolean)
    .join(' ');
}

function fallbackPricing() {
  return buildMerchPricingSnapshot({
    retailPriceCents: calculateRecommendedSalePriceCents(
      MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
      MERCH_DEFAULT_MARGIN_PRESET,
      { printfulCostSource: 'jovie_default', printfulCostUpdatedAt: null }
    ),
    printfulProductCostCents: MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
    printfulCostSource: 'jovie_default',
    printfulCostUpdatedAt: null,
  });
}

/**
 * Prefer live Printful catalog economics so generated options can publish.
 * Falls back to jovie_default (draft-only) when Printful is unavailable.
 */
async function resolveGenerationPricing(prompt: string) {
  try {
    const catalog = await resolveMerchCatalogSelection(prompt);
    return {
      pricing: catalog.pricing,
      productionWarnings: catalog.providerWarnings,
      productType: catalog.productType,
      productName: catalog.productName,
      catalogProductId: catalog.catalogProductId,
      catalogVariantIds: catalog.catalogVariantIds,
      variantMap: catalog.variantMap,
      colorway: catalog.colorway,
      sizes: catalog.sizes,
      placements: catalog.placements,
      technique: catalog.technique,
    };
  } catch {
    return {
      pricing: fallbackPricing(),
      productionWarnings: [] as string[],
      productType: MERCH_DEFAULT_PRINTFUL_PRODUCT.productType,
      productName: MERCH_DEFAULT_PRINTFUL_PRODUCT.productName,
      catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
      catalogVariantIds: Object.values(
        MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap
      ),
      variantMap: MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap,
      colorway: MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
      sizes: MERCH_DEFAULT_PRINTFUL_PRODUCT.sizes,
      placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
      technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
    };
  }
}

/**
 * Selection is the win signal: a model whose design the artist picks earns a
 * higher weight. `weight = 1 + picks` (Laplace-smoothed) so an unpicked model
 * still starts at 1 and stays in rotation via the selector's floor — the A/B
 * gently converges to the artist's preferred aesthetic without ever locking a
 * model out. Pure + exported for testing.
 */
export function selectionCountsToWeights(
  rows: readonly { readonly modelKey: string | null; readonly count: number }[]
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const { modelKey, count } of rows) {
    if (modelKey) weights[modelKey] = 1 + Math.max(0, count);
  }
  return weights;
}

/** Per-artist model weights from how often each model's design was selected. */
async function getModelSelectionWeights(
  profileId: string
): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({
        modelKey: drizzleSql<
          string | null
        >`${merchDesignOptions.learning}->>'imageModelKey'`,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(merchCards)
      .innerJoin(
        merchDesignOptions,
        eq(merchCards.selectedDesignOptionId, merchDesignOptions.id)
      )
      .where(eq(merchCards.creatorProfileId, profileId))
      .groupBy(drizzleSql`${merchDesignOptions.learning}->>'imageModelKey'`);
    return selectionCountsToWeights(rows);
  } catch (error) {
    // Never let a weights read break generation — fall back to equal weighting.
    logger.warn(
      '[merch-designs] model weight read failed; using equal weights',
      {
        err: error instanceof Error ? error.message : String(error),
      }
    );
    return {};
  }
}

/**
 * A selected design is the artist's strongest signal. Keep its strategy out
 * of the next generation batch when alternatives are available, rather than
 * asking the model to make another near-copy of the last approved visual.
 */
async function getRecentSelectedStrategyLabels(
  profileId: string
): Promise<readonly string[]> {
  try {
    const rows = await db
      .select({
        strategy: drizzleSql<
          string | null
        >`${merchDesignOptions.learning}->>'typographyStyle'`,
      })
      .from(merchCards)
      .innerJoin(
        merchDesignOptions,
        eq(merchCards.selectedDesignOptionId, merchDesignOptions.id)
      )
      .where(eq(merchCards.creatorProfileId, profileId))
      .orderBy(desc(merchCards.updatedAt))
      .limit(DEFAULT_DESIGN_COUNT);
    return rows.flatMap(row => (row.strategy ? [row.strategy] : []));
  } catch (error) {
    logger.warn(
      '[merch-designs] recent strategy read failed; generating from full strategy set',
      { err: error instanceof Error ? error.message : String(error) }
    );
    return [];
  }
}

/**
 * Logs the batch-level production receipt: canonical path, contract version,
 * per-option terminal mockup disposition, and final batch disposition.
 */
function toContentReviewView(review: MerchContentReview) {
  return {
    contract_version: review.contractVersion,
    reviewer_version: review.reviewerVersion,
    verdict: review.verdict,
    failure_codes: review.failureCodes,
    confidence: review.confidence,
    reviewed_at: review.reviewedAt,
  };
}

function toContentReviewReceipt(
  optionId: string,
  review: MerchContentReview
): MerchGenerationReceipt['contentReviews'][number] {
  return {
    optionId,
    contractVersion: review.contractVersion,
    reviewerVersion: review.reviewerVersion,
    verdict: review.verdict,
    failureCodes: review.failureCodes,
    confidence: review.confidence,
    reviewedAt: review.reviewedAt,
  };
}

function logMerchGenerationReceipt(receipt: MerchGenerationReceipt): void {
  logger.info('[merch-generation] production receipt', { ...receipt });
}

/**
 * Schedules durable, observable Printful mockup enrichment for the generated
 * designs (JOV-4743). Each option stays `pending_mockup` until the truthful
 * product mockup is attached (`mockup_ready`) or the retry budget/timeout is
 * exhausted (`mockup_failed`, which blocks publish). Replaces the previous
 * untracked fire-and-forget `Promise.allSettled` path.
 */
function schedulePrintfulMockupEnrichment(params: {
  readonly generationId: string;
  readonly profileId: string;
  readonly startedAt: number;
  readonly requestedDesignCount: number;
  readonly contentReviews: MerchGenerationReceipt['contentReviews'];
  readonly designs: readonly {
    readonly optionId: string;
    readonly printFileUrl: string;
  }[];
}): void {
  scheduleMerchMockupEnrichment(
    params.designs.map(({ optionId, printFileUrl }) => ({
      optionId,
      request: {
        printFileUrl,
        catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
        catalogVariantIds: Object.values(
          MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap
        ),
        placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
        technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
        productTypes: [MERCH_DEFAULT_PRINTFUL_PRODUCT.productType],
      },
    })),
    outcomes => {
      logMerchGenerationReceipt({
        pipeline: MERCH_CANONICAL_PIPELINE_ID,
        contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
        generationId: params.generationId,
        profileId: params.profileId,
        requestedDesignCount: params.requestedDesignCount,
        readyDesignCount: params.designs.length,
        mockups: outcomes,
        contentReviews: params.contentReviews,
        disposition: 'ready',
        durationMs: Date.now() - params.startedAt,
      });
    }
  );
}

/**
 * Generate the Phase-A design carousel. Designs are generated in parallel and
 * returned `ready`; the per-card generating shimmer activates once generation is
 * streamed (follow-up). Failures drop that design rather than failing the batch.
 */
export async function generateMerchDesigns(params: {
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly prompt: string;
  readonly count?: number;
  readonly source: MerchSource;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}): Promise<MerchDesignCarouselResult> {
  const startedAt = Date.now();
  if (requiresAssetPreservingRender(params.source)) {
    throw new TypeError(
      'This Library asset needs an asset-preserving render path. Jovie will not recreate an uploaded logo from a text prompt.'
    );
  }

  const generationId = randomUUID();
  const count = Math.min(Math.max(params.count ?? DEFAULT_DESIGN_COUNT, 1), 4);
  const [prerequisites, recentSelectedLabels] = await Promise.all([
    resolveMerchGenerationPrerequisites({
      artistName: () => artistName(params.profileId),
      catalog: () => resolveGenerationPricing(params.prompt),
      modelWeights: () => getModelSelectionWeights(params.profileId),
    }),
    getRecentSelectedStrategyLabels(params.profileId),
  ]);
  const { artistName: name, catalog, modelWeights } = prerequisites;
  const pricing = catalog.pricing;

  logger.info('[merch-designs] generation prerequisites ready', {
    ms: Date.now() - startedAt,
    generationId,
  });

  await db.insert(merchGenerationBatches).values({
    id: generationId,
    creatorProfileId: params.profileId,
    createdByClerkUserId: params.clerkUserId,
    chatConversationId: params.conversationId ?? null,
    chatTurnId: params.turnId ?? null,
    prompt: params.prompt,
    command: 'generate_merch_designs',
    artistBrief: minimalBrief(name, params.prompt, params.source),
    status: 'generating',
  });

  // Bias model selection toward the artist's previous picks while selecting
  // visual strategy families away from their recent choices.
  const directions = selectMerchDesignStrategies(count, recentSelectedLabels);
  const grossMargin =
    pricing.retailPriceCents -
    pricing.estimatedPrintfulProductCostCents -
    pricing.stripeFeeEstimateCents -
    pricing.refundReserveCents;

  const promptReview = reviewMerchContent({ prompt: params.prompt });
  const catalogWarnings = catalog.productionWarnings.filter(
    warning =>
      !warning.toLowerCase().includes('printful is not configured') &&
      !warning.toLowerCase().includes('catalog pricing unavailable')
  );

  const persistRejectedOption = async (input: {
    readonly optionId: string;
    readonly optionNumber: number;
    readonly designName: string;
    readonly concept: string;
    readonly review: MerchContentReview;
  }) => {
    await db.insert(merchDesignOptions).values({
      id: input.optionId,
      generationBatchId: generationId,
      creatorProfileId: params.profileId,
      optionNumber: input.optionNumber,
      status: 'rejected',
      designLane: 'fashion_graphic_item',
      designName: input.designName,
      productType: catalog.productType,
      printfulProductName: catalog.productName,
      printfulCatalogProductId: catalog.catalogProductId,
      printfulCatalogVariantIds: catalog.catalogVariantIds,
      variantMap: catalog.variantMap,
      colorway: catalog.colorway,
      availableSizes: catalog.sizes,
      placements: catalog.placements,
      technique: catalog.technique,
      retailPriceCents: pricing.retailPriceCents,
      estimatedPrintfulProductCostCents:
        pricing.estimatedPrintfulProductCostCents,
      estimatedShippingCostCents: pricing.estimatedShippingCostCents,
      estimatedGrossMarginCents: grossMargin,
      artistShareCents: pricing.artistPayoutPerUnitEstimateCents,
      jovieShareCents: pricing.jovieMarginPerUnitEstimateCents,
      pricing,
      concept: input.concept,
      whyItFits: MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
      mockupUrls: [],
      printFileUrls: [],
      productionWarnings: [
        ...catalogWarnings,
        MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
      ],
      qualityReview: {
        copyrightRisk: 'low',
        typography: 'generated',
        printFeasible: false,
        contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
        pipeline: MERCH_CANONICAL_PIPELINE_ID,
        ...stampMerchContentReview(input.review),
      },
      learning: {
        styleLane: 'fashion_graphic_item',
        typographyStyle: 'rejected',
        graphicDensity: 'minimal',
        garmentColor: catalog.colorway,
        motifs: [],
        selectedOverOptionIds: [],
        rejectedAttributes: [...input.review.failureCodes],
      },
    });
  };

  if (!evaluateMerchCandidateReadiness(promptReview).ready) {
    const optionId = randomUUID();
    await persistRejectedOption({
      optionId,
      optionNumber: 1,
      designName: `${name} quarantined`,
      concept: params.prompt,
      review: promptReview,
    });
    const contentReviews = [toContentReviewReceipt(optionId, promptReview)];
    logMerchGenerationReceipt({
      pipeline: MERCH_CANONICAL_PIPELINE_ID,
      contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
      generationId,
      profileId: params.profileId,
      requestedDesignCount: count,
      readyDesignCount: 0,
      mockups: [],
      contentReviews,
      disposition: 'failed',
      durationMs: Date.now() - startedAt,
    });
    await db
      .update(merchGenerationBatches)
      .set({
        status: 'failed',
        completedAt: new Date(),
      })
      .where(eq(merchGenerationBatches.id, generationId));
    return {
      success: true,
      generationId,
      prompt: params.prompt,
      contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
      contentContractVersion: MERCH_CONTENT_CONTRACT_VERSION,
      contentReviews: contentReviews.map(review => ({
        contract_version: review.contractVersion,
        reviewer_version: review.reviewerVersion,
        verdict: review.verdict,
        failure_codes: review.failureCodes,
        confidence: review.confidence,
        reviewed_at: review.reviewedAt,
      })),
      nextStep: MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
      designs: [],
    };
  }

  const attempts = await Promise.all(
    directions.map(
      async (
        direction,
        index
      ): Promise<{
        readonly optionId: string;
        readonly preview: MerchDesignPreview | null;
        readonly review: MerchContentReview | null;
      }> => {
        const optionId = randomUUID();
        const sourceLabel = params.source
          ? `${params.source.sourceType.replaceAll('_', ' ')}: ${params.source.provenanceTitle}`
          : null;
        const designName = params.source
          ? `${params.source.sourceText} ${direction.label}`
          : `${name} ${direction.label}`;
        const concept = `${direction.label} direction: ${params.prompt}${sourceLabel ? ` · Source: ${sourceLabel}` : ''}`;
        try {
          const graphic = await generatePrintGraphic({
            prompt: buildMerchImagePrompt(
              name,
              params.prompt,
              direction,
              params.source,
              recentSelectedLabels
            ),
            selection: { weights: modelWeights },
            content: { prompt: params.prompt, concept },
          });
          const previewUrl = await uploadAlphaPng(
            `merch/generated/${params.profileId}/${generationId}/${optionId}.png`,
            graphic.image
          );

          await db.insert(merchDesignOptions).values({
            id: optionId,
            generationBatchId: generationId,
            creatorProfileId: params.profileId,
            optionNumber: index + 1,
            status: 'candidate',
            designLane: 'fashion_graphic_item',
            designName,
            productType: catalog.productType,
            printfulProductName: catalog.productName,
            printfulCatalogProductId: catalog.catalogProductId,
            printfulCatalogVariantIds: catalog.catalogVariantIds,
            variantMap: catalog.variantMap,
            colorway: catalog.colorway,
            availableSizes: catalog.sizes,
            placements: catalog.placements,
            technique: catalog.technique,
            retailPriceCents: pricing.retailPriceCents,
            estimatedPrintfulProductCostCents:
              pricing.estimatedPrintfulProductCostCents,
            estimatedShippingCostCents: pricing.estimatedShippingCostCents,
            estimatedGrossMarginCents: grossMargin,
            artistShareCents: pricing.artistPayoutPerUnitEstimateCents,
            jovieShareCents: pricing.jovieMarginPerUnitEstimateCents,
            pricing,
            concept,
            whyItFits: params.source
              ? `Built from the verified ${params.source.sourceType.replaceAll('_', ' ')} “${params.source.sourceText}”.`
              : 'Illustrated graphic generated for this artist without an invented likeness.',
            mockupUrls: [previewUrl],
            printFileUrls: [previewUrl],
            productionWarnings: catalogWarnings,
            qualityReview: {
              copyrightRisk: 'low',
              typography: 'generated',
              printFeasible: true,
              contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
              pipeline: MERCH_CANONICAL_PIPELINE_ID,
              mockupStatus: 'pending_mockup',
              ...stampMerchContentReview(graphic.contentReview),
            },
            learning: {
              styleLane: 'fashion_graphic_item',
              typographyStyle: direction.label,
              graphicDensity: direction.density.includes('minimal')
                ? 'minimal'
                : direction.density.includes('high')
                  ? 'maximal'
                  : 'medium',
              garmentColor: catalog.colorway,
              motifs: [direction.motifSystem],
              selectedOverOptionIds: [],
              rejectedAttributes: [],
              imageModelKey: graphic.modelKey,
            },
          });

          return {
            optionId,
            review: graphic.contentReview,
            preview: {
              id: optionId,
              option_number: index + 1,
              design_name: designName,
              model_key: graphic.modelKey,
              concept,
              status: 'ready',
              mockup_status: 'pending_mockup',
              preview_url: previewUrl,
              slots: {
                artist_name: name,
                short_text: params.source.sourceText,
                source_label: sourceLabel ?? undefined,
                source_type: params.source.sourceType,
              },
              recommended: index === 0,
              product_name: catalog.productName,
              product_type: catalog.productType,
              colorway: catalog.colorway,
              sale_price: formatMerchMoney(pricing.retailPriceCents),
              artist_profit: formatMerchMoney(
                pricing.artistPayoutPerUnitEstimateCents
              ),
              fulfillment: 'Printful standard US',
              profile_destination: 'Artist profile merch section',
              sellability: {
                sellable: pricing.printfulCostSource === 'printful',
                reasons:
                  pricing.printfulCostSource === 'printful'
                    ? []
                    : [
                        'Catalog/fulfillment unavailable; approval will quarantine this item as a private draft.',
                      ],
              },
              content_review: toContentReviewView(graphic.contentReview),
            },
          };
        } catch (error) {
          if (error instanceof MerchPersonContentRejectedError) {
            await persistRejectedOption({
              optionId,
              optionNumber: index + 1,
              designName,
              concept,
              review: error.review,
            });
            logger.warn('[merch-designs] person-content rejected one design', {
              optionId,
              failureCodes: error.review.failureCodes,
            });
            return { optionId, preview: null, review: error.review };
          }
          logger.warn('[merch-designs] generation failed for one design', {
            optionId,
            err: error instanceof Error ? error.message : String(error),
          });
          return { optionId, preview: null, review: null };
        }
      }
    )
  );

  const ready = attempts.flatMap(attempt =>
    attempt.preview ? [attempt.preview] : []
  );
  const contentReviews = attempts.flatMap(attempt =>
    attempt.review
      ? [toContentReviewReceipt(attempt.optionId, attempt.review)]
      : []
  );

  logger.info('[merch-designs] generation response ready', {
    ms: Date.now() - startedAt,
    generationId,
    requestedDesignCount: count,
    readyDesignCount: ready.length,
    contentReviews,
  });

  const enrichmentDesigns = ready.flatMap(d =>
    d.preview_url ? [{ optionId: d.id, printFileUrl: d.preview_url }] : []
  );
  if (enrichmentDesigns.length > 0) {
    schedulePrintfulMockupEnrichment({
      generationId,
      profileId: params.profileId,
      startedAt,
      requestedDesignCount: count,
      contentReviews,
      designs: enrichmentDesigns,
    });
  } else {
    logMerchGenerationReceipt({
      pipeline: MERCH_CANONICAL_PIPELINE_ID,
      contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
      generationId,
      profileId: params.profileId,
      requestedDesignCount: count,
      readyDesignCount: 0,
      mockups: [],
      contentReviews,
      disposition: 'failed',
      durationMs: Date.now() - startedAt,
    });
  }

  await db
    .update(merchGenerationBatches)
    .set({
      status: ready.length > 0 ? 'ready' : 'failed',
      completedAt: new Date(),
    })
    .where(eq(merchGenerationBatches.id, generationId));

  return {
    success: true,
    generationId,
    prompt: params.prompt,
    contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
    contentContractVersion: MERCH_CONTENT_CONTRACT_VERSION,
    contentReviews: contentReviews.map(review => ({
      contract_version: review.contractVersion,
      reviewer_version: review.reviewerVersion,
      verdict: review.verdict,
      failure_codes: review.failureCodes,
      confidence: review.confidence,
      reviewed_at: review.reviewedAt,
    })),
    nextStep:
      ready.length === 0 &&
      contentReviews.some(review => review.verdict === 'reject')
        ? MERCH_PERSON_CONTENT_PUBLISH_BLOCKER
        : 'Pick one and I’ll put it on products.',
    designs: ready,
  };
}
