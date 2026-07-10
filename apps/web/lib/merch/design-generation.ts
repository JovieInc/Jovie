import 'server-only';

/**
 * Phase-A merch design generation.
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
import { sql as drizzleSql, eq } from 'drizzle-orm';
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
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from './default-catalog';
import { generatePrintGraphic } from './graphic-engine';
import { attachMockupsToDesignOption, generateProductMockups } from './mockups';
import {
  buildMerchPricingSnapshot,
  calculateRecommendedSalePriceCents,
  MERCH_DEFAULT_MARGIN_PRESET,
  MERCH_DEFAULT_PRINTFUL_PRODUCT_COST_CENTS,
} from './pricing';
import type { MerchDesignCarouselResult, MerchDesignPreview } from './types';

const DEFAULT_DESIGN_COUNT = 3;

/** Distinct art directions so the carousel reads as real variety, not 3 of the same. */
const STYLE_DIRECTIONS: readonly { label: string; style: string }[] = [
  {
    label: 'Vintage',
    style:
      'vintage distressed band-merch screen print, heavy wash and grain, retro limited palette, gnarly hand-drawn display lettering',
  },
  {
    label: 'Bold',
    style:
      'bold modern illustrated graphic, clean heavy linework, confident type lockup, high contrast',
  },
  {
    label: 'Mono',
    style:
      'minimal one-color line illustration, refined editorial type, lots of negative space, premium capsule feel',
  },
];

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

function minimalBrief(name: string, prompt: string): MerchArtistBrief {
  return {
    artist_myth: `${name} merch.`,
    fan_identity:
      'Fans want a wearable graphic that looks designed, not generic.',
    visual_language: ['illustrated graphic', 'band-merch energy'],
    forbidden_cliches: ['fake tour dates', 'generic centered logo'],
    campaign_context: `Artist request: ${prompt}`,
    best_merch_hypothesis: 'A strong illustrated graphic on a premium blank.',
    commercial_angle: 'Wearable artist graphic.',
    risk_level: 'safe',
  };
}

function buildImagePrompt(
  name: string,
  userPrompt: string,
  style: string
): string {
  return [
    `${style}.`,
    `Concept: ${userPrompt}.`,
    `Feature the artist name "${name}" as bold band-merch lettering.`,
    'Centered composition, print-ready artwork, no garment, no mockup.',
  ].join(' ');
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
 * Fire-and-forget: render the fulfillment-accurate Printful mockup for each
 * design (the alpha graphic on the real default product) and attach it. The
 * selected card then prefers the truthful Printful photo over the alpha preview
 * (selectPreferredMockupUrl). Non-blocking and best-effort — a Printful outage
 * leaves the alpha art in place. Pop-color / multi-product curation is a
 * follow-up; this ships the truthful default-product mockup.
 */
function attachPrintfulMockupsAsync(
  designs: readonly {
    readonly optionId: string;
    readonly printFileUrl: string;
  }[]
): void {
  void Promise.allSettled(
    designs.map(async ({ optionId, printFileUrl }) => {
      try {
        const { results } = await generateProductMockups({
          printFileUrl,
          catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
          catalogVariantIds: Object.values(
            MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap
          ),
          placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
          technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
          productTypes: [MERCH_DEFAULT_PRINTFUL_PRODUCT.productType],
        });
        const mockupUrls = results.flatMap(r => r.mockupUrls);
        if (mockupUrls.length > 0) {
          await attachMockupsToDesignOption(optionId, mockupUrls);
        }
      } catch (error) {
        logger.warn('[merch-designs] printful mockup attach failed', {
          optionId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    })
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
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}): Promise<MerchDesignCarouselResult> {
  const name = await artistName(params.profileId);
  const generationId = randomUUID();
  const count = Math.min(Math.max(params.count ?? DEFAULT_DESIGN_COUNT, 1), 4);
  // Resolve live Printful economics up front so selected designs can go live
  // without a separate cost-hydration step (JOV-3393 demo path).
  const catalog = await resolveGenerationPricing(params.prompt);
  const pricing = catalog.pricing;

  await db.insert(merchGenerationBatches).values({
    id: generationId,
    creatorProfileId: params.profileId,
    createdByClerkUserId: params.clerkUserId,
    chatConversationId: params.conversationId ?? null,
    chatTurnId: params.turnId ?? null,
    prompt: params.prompt,
    command: 'generate_merch_designs',
    artistBrief: minimalBrief(name, params.prompt),
    status: 'generating',
  });

  // Bias model selection toward the artist's previously-picked aesthetic.
  const modelWeights = await getModelSelectionWeights(params.profileId);

  const directions = STYLE_DIRECTIONS.slice(0, count);
  const grossMargin =
    pricing.retailPriceCents -
    pricing.estimatedPrintfulProductCostCents -
    pricing.stripeFeeEstimateCents -
    pricing.refundReserveCents;

  const designs = await Promise.all(
    directions.map(
      async (direction, index): Promise<MerchDesignPreview | null> => {
        const optionId = randomUUID();
        try {
          const graphic = await generatePrintGraphic({
            prompt: buildImagePrompt(name, params.prompt, direction.style),
            selection: { weights: modelWeights },
          });
          const previewUrl = await uploadAlphaPng(
            `merch/generated/${params.profileId}/${generationId}/${optionId}.png`,
            graphic.image
          );
          const designName = `${name} ${direction.label}`;
          const concept = `${direction.label} direction: ${params.prompt}`;

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
            whyItFits: 'Illustrated graphic generated for this artist.',
            mockupUrls: [previewUrl],
            printFileUrls: [previewUrl],
            // Catalog warnings about unavailability stay; cost-source warnings
            // that mark draft-only should not block when Printful is healthy.
            productionWarnings: catalog.productionWarnings.filter(
              warning =>
                !warning.toLowerCase().includes('printful is not configured') &&
                !warning.toLowerCase().includes('catalog pricing unavailable')
            ),
            qualityReview: {
              copyrightRisk: 'low',
              typography: 'generated',
              printFeasible: true,
            },
            learning: {
              styleLane: 'fashion_graphic_item',
              typographyStyle: direction.label,
              graphicDensity: 'medium',
              garmentColor: catalog.colorway,
              motifs: [direction.label],
              selectedOverOptionIds: [],
              rejectedAttributes: [],
              imageModelKey: graphic.modelKey,
            },
          });

          return {
            id: optionId,
            option_number: index + 1,
            design_name: designName,
            model_key: graphic.modelKey,
            concept,
            status: 'ready',
            preview_url: previewUrl,
            slots: { artist_name: name },
          };
        } catch (error) {
          logger.warn('[merch-designs] generation failed for one design', {
            optionId,
            err: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }
    )
  );

  const ready = designs.filter((d): d is MerchDesignPreview => d !== null);

  // Non-blocking: attach the truthful Printful product mockup to each design.
  attachPrintfulMockupsAsync(
    ready.flatMap(d =>
      d.preview_url ? [{ optionId: d.id, printFileUrl: d.preview_url }] : []
    )
  );

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
    nextStep: 'Pick one and I’ll put it on products.',
    designs: ready,
  };
}
