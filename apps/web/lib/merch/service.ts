import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  sql as drizzleSql,
  eq,
  ne,
  notInArray,
} from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { CACHE_TAGS, createProfileTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { getAuthenticatedProfile } from '@/lib/db/queries/shared';
import { discogReleases } from '@/lib/db/schema/content';
import {
  type MerchArtistBrief,
  type MerchCard,
  type MerchDesignOption,
  type MerchLearningSnapshot,
  type MerchPricingSnapshot,
  type MerchPrintfulSnapshot,
  type MerchVariantMap,
  merchCards,
  merchDesignOptions,
  merchGenerationBatches,
  merchPayoutLedgerEntries,
} from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { logger } from '@/lib/utils/logger';
import { createMerchArtwork } from './artwork';
import { resolveMerchCatalogSelection } from './catalog';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from './default-catalog';
import { selectPreferredMockupUrl } from './mockup-urls';
import { attachMockupsToDesignOption, generateProductMockups } from './mockups'; // HOT ZONE pipeline (gh-9803)
import {
  buildMerchPresetPriceQuotes,
  buildMerchPricingSnapshot,
  formatMerchMoney,
  MERCH_DEFAULT_MARGIN_PRESET,
  type MerchSellabilityResult,
} from './pricing';
import { getMerchCardSellability } from './safety';
import type {
  LibraryMerchCard,
  MerchDesignLane,
  MerchGenerationOptionView,
  MerchGenerationResult,
  MerchSelectionResult,
  PublicMerchCard,
} from './types';

const merchCommandSchema = z
  .string()
  .max(80)
  .optional()
  .default('create_merch');

interface CreatorProfileForMerch {
  readonly id: string;
  readonly usernameNormalized: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly genres: string[] | null;
  readonly location: string | null;
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
}

interface MerchOptionSpec {
  readonly lane: MerchDesignLane;
  readonly designName: string;
  readonly concept: string;
  readonly whyItFits: string;
  readonly typographyStyle: string;
  readonly density: 'minimal' | 'medium' | 'maximal';
  readonly motifs: string[];
}

function artistName(profile: CreatorProfileForMerch): string {
  return profile.displayName?.trim() || profile.username;
}

async function getCreatorProfileForMerch(
  profileId: string
): Promise<CreatorProfileForMerch> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
      location: creatorProfiles.location,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error('Creator profile not found');
  }

  return profile;
}

async function assertCanManageMerchProfile(
  profileId: string,
  clerkUserId: string
): Promise<void> {
  const profile = await getAuthenticatedProfile(db, profileId, clerkUserId);
  if (!profile) {
    throw new Error('Merch card not found');
  }
}

async function getProfileUsernameNormalized(
  profileId: string
): Promise<string | null> {
  const [profile] = await db
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profile?.usernameNormalized ?? null;
}

async function getReleaseContext(profileId: string): Promise<string> {
  const releases = await db
    .select({
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
      releaseType: discogReleases.releaseType,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId))
    .orderBy(desc(discogReleases.releaseDate))
    .limit(3);

  if (releases.length === 0) {
    return 'No release campaign is connected yet.';
  }

  return releases
    .map(release => {
      const date = release.releaseDate
        ? new Date(release.releaseDate).toISOString().slice(0, 10)
        : 'date unknown';
      return `${release.title} (${release.releaseType}, ${date})`;
    })
    .join('; ');
}

function buildArtistBrief(
  profile: CreatorProfileForMerch,
  releaseContext: string,
  prompt: string
): MerchArtistBrief {
  const name = artistName(profile);
  const genres = profile.genres?.filter(Boolean) ?? [];
  const genreLine = genres.length > 0 ? genres.join(', ') : 'independent music';
  const locationLine = profile.location ? ` from ${profile.location}` : '';

  return {
    artist_myth: `${name} makes ${genreLine}${locationLine}.`,
    fan_identity:
      profile.spotifyFollowers && profile.spotifyFollowers > 10_000
        ? 'Fans already have enough context for a more coded, collectible item.'
        : 'Fans need an item that clearly introduces the world without looking generic.',
    visual_language: [
      genreLine,
      profile.location ?? 'scene-neutral',
      'high-contrast typography',
      'restrained premium blank',
    ],
    forbidden_cliches: [
      'generic centered logo',
      'fake tour dates',
      'random skulls',
      'random flames',
      'fake brand marks',
      'AI-rendered typography',
    ],
    campaign_context: `${releaseContext} Artist request: ${prompt}`,
    best_merch_hypothesis:
      'A black premium tee with deterministic typography, real artist naming, and no fake claims is the safest first SKU.',
    commercial_angle:
      'Make one item that works as both artist merch and a wearable graphic object.',
    risk_level:
      profile.spotifyPopularity && profile.spotifyPopularity > 45
        ? 'medium'
        : 'safe',
  };
}

function productSuffixFromProductType(productType: string): string {
  const normalized = productType.trim().toLowerCase();
  if (
    normalized.includes('shirt') ||
    normalized.includes('tee') ||
    normalized.includes('t-shirt')
  ) {
    return 'Tee';
  }
  if (normalized.includes('hoodie') || normalized.includes('sweatshirt')) {
    return 'Hoodie';
  }
  if (
    normalized.includes('hat') ||
    normalized.includes('cap') ||
    normalized.includes('beanie')
  ) {
    return 'Hat';
  }
  if (normalized.includes('tank')) {
    return 'Tank Top';
  }

  return 'Tee';
}

function buildOptionSpecs(
  profile: CreatorProfileForMerch,
  productType: string
): MerchOptionSpec[] {
  const name = artistName(profile);
  const genre = profile.genres?.[0] ?? 'independent';
  const city = profile.location ?? 'the scene';
  const productSuffix = productSuffixFromProductType(productType);
  const productLabel = productSuffix.toLowerCase();

  return [
    {
      lane: 'band_tour_uniform',
      designName: `${name} Signal ${productSuffix}`,
      concept: `A real-show uniform built around ${name} with heavyweight front typography and no fake dates.`,
      whyItFits: `It gives ${name} a clear merch-table object without inventing tour claims.`,
      typographyStyle: 'stacked venue typography',
      density: 'maximal',
      motifs: [genre, city, 'signal grid'],
    },
    {
      lane: 'fashion_graphic_item',
      designName: `${name} Object ${productSuffix}`,
      concept: `A restrained fashion graphic item that reads as a premium ${productLabel} first and artist merch second.`,
      whyItFits:
        'It is wearable for fans who want taste and context without a loud logo.',
      typographyStyle: 'quiet capsule typography',
      density: 'minimal',
      motifs: [genre, 'capsule object'],
    },
    {
      lane: 'artist_world_artifact',
      designName: `${name} Archive ${productSuffix}`,
      concept:
        'A collectible artifact from the artist world, using coded language and a structured print layout.',
      whyItFits:
        'It gives top fans something specific enough to feel owned by the artist universe.',
      typographyStyle: 'archive label typography',
      density: 'medium',
      motifs: [genre, 'archive label', city],
    },
  ];
}

function isMerchDesignLane(value: string): value is MerchDesignLane {
  return (
    value === 'band_tour_uniform' ||
    value === 'fashion_graphic_item' ||
    value === 'artist_world_artifact'
  );
}

function buildAlternativeDesignName(
  sourceTitle: string,
  productType: string
): string {
  const title = sourceTitle.trim();
  const lowerTitle = title.toLowerCase();
  const removableSuffixes = [
    'tank top',
    'sweatshirt',
    't-shirt',
    'hoodie',
    'beanie',
    'shirt',
    'tee',
    'cap',
    'hat',
  ];
  const matchedSuffix = removableSuffixes.find(
    suffix => lowerTitle === suffix || lowerTitle.endsWith(` ${suffix}`)
  );
  const baseTitle = matchedSuffix
    ? title.slice(0, title.length - matchedSuffix.length).trim()
    : title;
  return `${baseTitle || title} ${productSuffixFromProductType(productType)}`;
}

function buildLearningSnapshot(
  spec: MerchOptionSpec,
  garmentColor: string,
  selectedOverOptionIds: string[] = []
): MerchLearningSnapshot {
  return {
    styleLane: spec.lane,
    typographyStyle: spec.typographyStyle,
    graphicDensity: spec.density,
    garmentColor,
    motifs: spec.motifs,
    selectedOverOptionIds,
    rejectedAttributes: [],
  };
}

function buildPrintfulSnapshot(params: {
  readonly catalogProductId: number;
  readonly catalogVariantIds: number[];
  readonly variantMap: MerchVariantMap;
  readonly placements: string[];
  readonly technique: MerchDesignOption['technique'];
  readonly printFileUrl: string;
  readonly availabilityRegion: string;
  readonly shippingProfile: string;
  readonly productName: string;
  readonly pricing: MerchPricingSnapshot;
  readonly providerWarnings?: readonly string[];
}): MerchPrintfulSnapshot {
  return {
    catalogProductId: params.catalogProductId,
    catalogVariantIds: params.catalogVariantIds,
    variantMap: params.variantMap,
    placements: params.placements,
    techniques: [params.technique],
    printFileUrls: [params.printFileUrl],
    availabilityRegion: params.availabilityRegion,
    shippingProfile: params.shippingProfile,
    catalogCostSource: params.pricing.printfulCostSource ?? 'jovie_default',
    catalogCostUpdatedAt: params.pricing.printfulCostUpdatedAt ?? null,
    catalogProductName: params.productName,
    providerWarnings: [...(params.providerWarnings ?? [])],
  };
}

function getDesignOptionSellability(
  option: MerchDesignOption
): MerchSellabilityResult {
  const printful = buildPrintfulSnapshot({
    catalogProductId: option.printfulCatalogProductId,
    catalogVariantIds: option.printfulCatalogVariantIds,
    variantMap: option.variantMap,
    placements: option.placements,
    technique: option.technique,
    printFileUrl: option.printFileUrls[0] ?? '',
    availabilityRegion: MERCH_DEFAULT_PRINTFUL_PRODUCT.availabilityRegion,
    shippingProfile: MERCH_DEFAULT_PRINTFUL_PRODUCT.shippingProfile,
    productName: option.printfulProductName,
    pricing: option.pricing,
  });
  const reasons = [
    ...getMerchCardSellability({
      currency: 'USD',
      retailPriceCents: option.retailPriceCents,
      estimatedPrintfulProductCostCents:
        option.estimatedPrintfulProductCostCents,
      artistRoyaltyRateBps: option.pricing.artistRoyaltyRateBps,
      pricing: option.pricing,
      primaryImageUrl: selectPreferredMockupUrl(option.mockupUrls) ?? '',
      mockupUrls: option.mockupUrls,
      printful,
    }).reasons,
  ];
  if (option.productionWarnings.length > 0) {
    reasons.push('Unresolved production warnings.');
  }
  return { sellable: reasons.length === 0, reasons };
}

function validateMerchCardForPublishing(card: MerchCard): void {
  const result = getMerchCardSellability(card);
  if (!result.sellable) {
    throw new Error(
      `Merch card cannot be published: ${result.reasons.join(' ')}`
    );
  }
}

function buildOptionPriceRecommendation(option: MerchDesignOption) {
  const presetQuotes = buildMerchPresetPriceQuotes({
    printfulProductCostCents: option.estimatedPrintfulProductCostCents,
    shippingCostCents: option.estimatedShippingCostCents,
    refundReserveCents: option.pricing.refundReserveCents,
    artistRoyaltyRateBps: option.pricing.artistRoyaltyRateBps,
    printfulCostSource: option.pricing.printfulCostSource,
    printfulCostUpdatedAt: option.pricing.printfulCostUpdatedAt,
  });
  const activePreset =
    presetQuotes.find(quote => quote.preset === MERCH_DEFAULT_MARGIN_PRESET) ??
    presetQuotes[1];

  return {
    sale_price: activePreset.salePrice,
    profit: activePreset.profit,
    margin_preset: activePreset.preset,
    presets: presetQuotes.map(quote => ({
      preset: quote.preset,
      label: quote.label,
      sale_price: quote.salePrice,
      profit: quote.profit,
    })),
    estimated_printful_cost:
      option.estimatedPrintfulProductCostCents > 0
        ? formatMerchMoney(option.estimatedPrintfulProductCostCents)
        : undefined,
  };
}

function optionToView(option: MerchDesignOption): MerchGenerationOptionView {
  const sellability = getDesignOptionSellability(option);
  return {
    id: option.id,
    option_number: option.optionNumber,
    design_name: option.designName,
    product_type: option.productType,
    printful_product_name: option.printfulProductName,
    printful_catalog_product_id: option.printfulCatalogProductId,
    printful_variant_ids: option.printfulCatalogVariantIds,
    colorway: option.colorway,
    available_sizes: option.availableSizes,
    placements: option.placements,
    technique: option.technique,
    price_recommendation: buildOptionPriceRecommendation(option),
    sellability,
    concept: option.concept,
    why_it_fits: option.whyItFits,
    mockup_urls: option.mockupUrls,
    production_warnings: option.productionWarnings,
  };
}

function toPublicMerchCard(card: MerchCard): PublicMerchCard {
  return {
    id: card.id,
    artistId: card.creatorProfileId,
    status: card.status,
    title: card.title,
    description: card.description,
    productType: card.productType,
    primaryImageUrl: card.primaryImageUrl,
    mockupUrls: card.mockupUrls,
    printful: card.printful,
    pricing: card.pricing,
    retailPriceCents: card.retailPriceCents,
    rankScore: card.rankScore,
    position: card.position,
    pinned: card.pinned,
  };
}

function toLibraryMerchCard(card: MerchCard): LibraryMerchCard {
  const sellability = getMerchCardSellability(card);
  return {
    id: card.id,
    status: card.status,
    title: card.title,
    description: card.description,
    productType: card.productType,
    primaryImageUrl: card.primaryImageUrl,
    mockupUrls: card.mockupUrls,
    retailPriceCents: card.retailPriceCents,
    artistPayoutPerUnitEstimateCents: card.artistPayoutPerUnitEstimateCents,
    jovieMarginPerUnitEstimateCents: card.jovieMarginPerUnitEstimateCents,
    sellable: sellability.sellable,
    sellabilityReasons: sellability.reasons,
    rankScore: card.rankScore,
    position: card.position,
    pinned: card.pinned,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    publishedAt: card.publishedAt?.toISOString() ?? null,
  };
}

function publicMerchUrl(username: string, cardId: string): string {
  const baseUrl = publicEnv.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie';
  return `${baseUrl}/${username}/merch/${cardId}`;
}

function revalidatePublicProfile(usernameNormalized: string): void {
  revalidateTag(CACHE_TAGS.PUBLIC_PROFILE, 'max');
  revalidateTag(createProfileTag(usernameNormalized), 'max');
}

function calculateRankScore(
  card: Pick<
    MerchCard,
    'purchases' | 'clicks' | 'views' | 'grossMarginCents' | 'createdAt'
  >
): number {
  const views = Math.max(card.views, 1);
  const conversionRateScore = Math.min(
    1000,
    Math.round((card.purchases / views) * 1000)
  );
  const revenueScore = Math.min(1000, Math.round(card.grossMarginCents / 100));
  const clickScore = Math.min(1000, Math.round((card.clicks / views) * 500));
  const ageHours = Math.max(
    1,
    (Date.now() - new Date(card.createdAt).getTime()) / 3_600_000
  );
  const recencyBoost = Math.max(0, Math.round(120 / ageHours));
  return Math.round(
    0.2 * conversionRateScore +
      0.15 * revenueScore +
      0.1 * clickScore +
      0.05 * recencyBoost +
      50
  );
}

function attachPrintfulMockupsAsync(
  options: readonly MerchDesignOption[]
): void {
  void Promise.allSettled(
    options.map(async option => {
      const printFileUrl = option.printFileUrls[0];
      if (!printFileUrl) {
        logger.warn('[merch-pipeline] skipping mockups without print file', {
          optionId: option.id,
        });
        return;
      }

      try {
        const { results, errors } = await generateProductMockups({
          printFileUrl,
          catalogProductId: option.printfulCatalogProductId,
          catalogVariantIds: option.printfulCatalogVariantIds,
          placements: option.placements,
          technique: option.technique,
          productTypes: [option.productType],
        });
        const mockupUrls = results.flatMap(result => result.mockupUrls);
        if (mockupUrls.length > 0) {
          await attachMockupsToDesignOption(option.id, mockupUrls);
          logger.info('[merch-pipeline] Printful mockups attached', {
            optionId: option.id,
            mockupCount: mockupUrls.length,
          });
        } else if (errors.length > 0) {
          logger.warn('[merch-pipeline] Printful mockup generation failed', {
            optionId: option.id,
            errors,
          });
        }
      } catch (error) {
        logger.warn(
          '[merch-pipeline] mockup step failed (non-fatal for batch)',
          {
            optionId: option.id,
            err: error instanceof Error ? error.message : String(error),
          }
        );
      }
    })
  );
}

export async function createMerchGeneration(params: {
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly prompt: string;
  readonly command?: string;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}): Promise<MerchGenerationResult> {
  const command = merchCommandSchema.parse(params.command);
  const profile = await getCreatorProfileForMerch(params.profileId);
  const releaseContext = await getReleaseContext(params.profileId);
  const artistBrief = buildArtistBrief(profile, releaseContext, params.prompt);
  const generationId = randomUUID();

  await db.insert(merchGenerationBatches).values({
    id: generationId,
    creatorProfileId: params.profileId,
    createdByClerkUserId: params.clerkUserId,
    chatConversationId: params.conversationId ?? null,
    chatTurnId: params.turnId ?? null,
    prompt: params.prompt,
    command,
    artistBrief,
    status: 'generating',
  });

  try {
    const catalog = await resolveMerchCatalogSelection(params.prompt);
    const { pricing, providerWarnings } = catalog;
    const specs = buildOptionSpecs(profile, catalog.productType);
    const insertedOptions: MerchDesignOption[] = [];

    for (const [index, spec] of specs.entries()) {
      const optionId = randomUUID();
      const artwork = await createMerchArtwork({
        profileId: params.profileId,
        generationId,
        optionId,
        artistName: artistName(profile),
        designName: spec.designName,
        lane: spec.lane,
        concept: spec.concept,
        productType: catalog.productType,
      });
      const grossMargin =
        pricing.retailPriceCents -
        pricing.estimatedPrintfulProductCostCents -
        pricing.stripeFeeEstimateCents -
        pricing.refundReserveCents;
      const [option] = await db
        .insert(merchDesignOptions)
        .values({
          id: optionId,
          generationBatchId: generationId,
          creatorProfileId: params.profileId,
          optionNumber: index + 1,
          status: 'candidate',
          designLane: spec.lane,
          designName: spec.designName,
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
          concept: spec.concept,
          whyItFits: spec.whyItFits,
          mockupUrls: [artwork.mockupUrl],
          printFileUrls: [artwork.printFileUrl],
          productionWarnings: providerWarnings,
          qualityReview: {
            copyrightRisk: 'low',
            typography: 'deterministic',
            printFeasible: true,
          },
          learning: buildLearningSnapshot(spec, catalog.colorway),
        })
        .returning();

      insertedOptions.push(option);
    }

    // Async Printful photorealistic mockups (non-blocking). Internal artwork mockups
    // are already persisted; Printful URLs are merged when tasks complete.
    attachPrintfulMockupsAsync(insertedOptions);

    await db
      .update(merchGenerationBatches)
      .set({ status: 'ready', completedAt: new Date() })
      .where(eq(merchGenerationBatches.id, generationId));

    return {
      success: true,
      generationId,
      artistBrief,
      options: insertedOptions.map(optionToView),
      prompt: params.prompt,
    };
  } catch (error) {
    await db
      .update(merchGenerationBatches)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown merch error',
        completedAt: new Date(),
      })
      .where(eq(merchGenerationBatches.id, generationId));
    throw error;
  }
}

async function getOptionForSelection(params: {
  readonly generationId: string;
  readonly optionId?: string | null;
  readonly optionNumber?: number | null;
}): Promise<MerchDesignOption> {
  const conditions = [
    eq(merchDesignOptions.generationBatchId, params.generationId),
  ];
  if (params.optionId) {
    conditions.push(eq(merchDesignOptions.id, params.optionId));
  } else if (params.optionNumber) {
    conditions.push(eq(merchDesignOptions.optionNumber, params.optionNumber));
  } else {
    throw new Error('Select a merch option by option number or option ID');
  }

  const [option] = await db
    .select()
    .from(merchDesignOptions)
    .where(and(...conditions))
    .limit(1);

  if (!option) {
    throw new Error('Merch design option not found');
  }

  return option;
}

/**
 * Ensure a design option carries live Printful economics before card create /
 * publish. Phase-A carousel used to stamp jovie_default costs, which hard-blocks
 * sellability forever (JOV-3393). Idempotent when already printful-sourced.
 */
async function hydrateOptionPrintfulEconomics(
  option: MerchDesignOption
): Promise<MerchDesignOption> {
  if (option.pricing.printfulCostSource === 'printful') {
    return option;
  }

  const catalog = await resolveMerchCatalogSelection(
    option.productType || option.printfulProductName || option.designName
  );
  if (catalog.pricing.printfulCostSource !== 'printful') {
    return option;
  }

  const pricing = catalog.pricing;
  const grossMargin =
    pricing.retailPriceCents -
    pricing.estimatedPrintfulProductCostCents -
    pricing.stripeFeeEstimateCents -
    pricing.refundReserveCents;

  const [updated] = await db
    .update(merchDesignOptions)
    .set({
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
      // Drop draft-only cost warnings once real Printful costs land.
      productionWarnings: option.productionWarnings.filter(
        warning =>
          !warning.toLowerCase().includes('printful is not configured') &&
          !warning.toLowerCase().includes('catalog pricing unavailable') &&
          !warning.toLowerCase().includes('draft-only')
      ),
      updatedAt: new Date(),
    })
    .where(eq(merchDesignOptions.id, option.id))
    .returning();

  return updated ?? option;
}

/**
 * Refresh merch card economics from Printful when still on jovie_default so
 * publish / checkout sellability can pass (JOV-3393).
 */
async function hydrateMerchCardPrintfulEconomics(
  card: MerchCard
): Promise<MerchCard> {
  if (card.printful.catalogCostSource === 'printful') {
    return card;
  }

  const catalog = await resolveMerchCatalogSelection(
    card.productType || card.title
  );
  if (catalog.pricing.printfulCostSource !== 'printful') {
    return card;
  }

  const pricing = catalog.pricing;
  const printful: MerchPrintfulSnapshot = {
    ...card.printful,
    catalogProductId: catalog.catalogProductId,
    catalogVariantIds: catalog.catalogVariantIds,
    variantMap: catalog.variantMap,
    placements: catalog.placements,
    techniques: [catalog.technique],
    catalogCostSource: 'printful',
    catalogCostUpdatedAt:
      pricing.printfulCostUpdatedAt ?? new Date().toISOString(),
    catalogProductName: catalog.productName,
    providerWarnings: (card.printful.providerWarnings ?? []).filter(
      warning =>
        !warning.toLowerCase().includes('printful is not configured') &&
        !warning.toLowerCase().includes('catalog pricing unavailable') &&
        !warning.toLowerCase().includes('draft-only')
    ),
  };

  const [updated] = await db
    .update(merchCards)
    .set({
      productType: catalog.productType,
      printful,
      retailPriceCents: pricing.retailPriceCents,
      estimatedPrintfulProductCostCents:
        pricing.estimatedPrintfulProductCostCents,
      estimatedShippingCostCents: pricing.estimatedShippingCostCents,
      artistRoyaltyRateBps: pricing.artistRoyaltyRateBps,
      artistPayoutPerUnitEstimateCents:
        pricing.artistPayoutPerUnitEstimateCents,
      jovieMarginPerUnitEstimateCents: pricing.jovieMarginPerUnitEstimateCents,
      pricing,
      updatedAt: new Date(),
    })
    .where(eq(merchCards.id, card.id))
    .returning();

  return updated ?? card;
}

export async function selectMerchDesign(params: {
  readonly generationId: string;
  readonly clerkUserId: string;
  readonly optionId?: string | null;
  readonly optionNumber?: number | null;
  readonly publish?: boolean;
}): Promise<MerchSelectionResult> {
  const rawSelected = await getOptionForSelection(params);
  await assertCanManageMerchProfile(
    rawSelected.creatorProfileId,
    params.clerkUserId
  );
  const selected = await hydrateOptionPrintfulEconomics(rawSelected);
  const profile = await getCreatorProfileForMerch(selected.creatorProfileId);
  const publishSellability = getDesignOptionSellability(selected);
  const shouldPublish = params.publish === true && publishSellability.sellable;

  const existing = await db
    .select()
    .from(merchCards)
    .where(eq(merchCards.selectedDesignOptionId, selected.id))
    .limit(1);

  let card = existing[0] ?? null;
  if (!card) {
    const rejected = await db
      .select({ id: merchDesignOptions.id })
      .from(merchDesignOptions)
      .where(
        and(
          eq(merchDesignOptions.generationBatchId, selected.generationBatchId),
          ne(merchDesignOptions.id, selected.id)
        )
      );
    const learning = {
      ...selected.learning,
      selectedOverOptionIds: rejected.map(item => item.id),
    };
    const printful = buildPrintfulSnapshot({
      catalogProductId: selected.printfulCatalogProductId,
      catalogVariantIds: selected.printfulCatalogVariantIds,
      variantMap: selected.variantMap,
      placements: selected.placements,
      technique: selected.technique,
      printFileUrl: selected.printFileUrls[0] ?? '',
      availabilityRegion: MERCH_DEFAULT_PRINTFUL_PRODUCT.availabilityRegion,
      shippingProfile: MERCH_DEFAULT_PRINTFUL_PRODUCT.shippingProfile,
      productName: selected.printfulProductName,
      pricing: selected.pricing,
      providerWarnings: selected.productionWarnings,
    });

    const [inserted] = await db
      .insert(merchCards)
      .values({
        creatorProfileId: selected.creatorProfileId,
        createdByClerkUserId: params.clerkUserId,
        selectedDesignOptionId: selected.id,
        status: shouldPublish ? 'live' : 'draft',
        title: selected.designName,
        description: selected.concept,
        productType: selected.productType,
        primaryImageUrl: selectPreferredMockupUrl(selected.mockupUrls) ?? '',
        mockupUrls: selected.mockupUrls,
        printful,
        currency: 'USD',
        retailPriceCents: selected.retailPriceCents,
        estimatedPrintfulProductCostCents:
          selected.estimatedPrintfulProductCostCents,
        estimatedShippingCostCents: selected.estimatedShippingCostCents,
        platformFeeCents: 0,
        artistRoyaltyRateBps: selected.pricing.artistRoyaltyRateBps,
        artistPayoutPerUnitEstimateCents: selected.artistShareCents,
        jovieMarginPerUnitEstimateCents: selected.jovieShareCents,
        pricing: selected.pricing,
        rankScore: 50,
        learning,
        publishedAt: shouldPublish ? new Date() : null,
      })
      .returning();
    card = inserted;
  } else if (shouldPublish && card.status !== 'live') {
    validateMerchCardForPublishing(card);
    [card] = await db
      .update(merchCards)
      .set({ status: 'live', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(merchCards.id, card.id))
      .returning();
  }

  await db
    .update(merchDesignOptions)
    .set({ status: 'selected', updatedAt: new Date() })
    .where(eq(merchDesignOptions.id, selected.id));
  await db
    .update(merchDesignOptions)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(
      and(
        eq(merchDesignOptions.generationBatchId, selected.generationBatchId),
        ne(merchDesignOptions.id, selected.id)
      )
    );
  await db
    .update(merchGenerationBatches)
    .set({
      selectedOptionId: selected.id,
      selectedMerchCardId: card.id,
      completedAt: new Date(),
      status: 'ready',
    })
    .where(eq(merchGenerationBatches.id, selected.generationBatchId));

  if (card.status === 'live') {
    revalidatePublicProfile(profile.usernameNormalized);
  }

  return {
    success: true,
    merchCardId: card.id,
    status: card.status,
    selectedOptionId: selected.id,
    title: card.title,
    publicUrl:
      card.status === 'live'
        ? publicMerchUrl(profile.usernameNormalized, card.id)
        : null,
    publishBlockedReasons:
      params.publish === true && !publishSellability.sellable
        ? publishSellability.reasons
        : undefined,
  };
}

export async function createAlternativeMerchItem(params: {
  readonly merchCardId: string;
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly itemType: string;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}): Promise<
  MerchSelectionResult & {
    readonly sourceMerchCardId: string;
    readonly productType: string;
    readonly printfulProductName: string;
  }
> {
  await assertCanManageMerchProfile(params.profileId, params.clerkUserId);

  const [sourceCard] = await db
    .select()
    .from(merchCards)
    .where(
      and(
        eq(merchCards.id, params.merchCardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (!sourceCard) {
    throw new Error('Merch card not found');
  }

  const [sourceOption] = sourceCard.selectedDesignOptionId
    ? await db
        .select()
        .from(merchDesignOptions)
        .where(eq(merchDesignOptions.id, sourceCard.selectedDesignOptionId))
        .limit(1)
    : [];
  const printFileUrl =
    sourceOption?.printFileUrls[0] ?? sourceCard.printful.printFileUrls[0];
  if (!printFileUrl) {
    throw new Error('Original merch design has no reusable print file');
  }

  const profile = await getCreatorProfileForMerch(params.profileId);
  const releaseContext = await getReleaseContext(params.profileId);
  const prompt = `Create a ${params.itemType} version of ${sourceCard.title} with the same design.`;
  const artistBrief = buildArtistBrief(profile, releaseContext, prompt);
  const generationId = randomUUID();

  await db.insert(merchGenerationBatches).values({
    id: generationId,
    creatorProfileId: params.profileId,
    createdByClerkUserId: params.clerkUserId,
    chatConversationId: params.conversationId ?? null,
    chatTurnId: params.turnId ?? null,
    prompt,
    command: 'create_merch_alternative_item',
    artistBrief,
    status: 'generating',
  });

  try {
    const catalog = await resolveMerchCatalogSelection(params.itemType);
    const { pricing, providerWarnings } = catalog;
    const grossMargin =
      pricing.retailPriceCents -
      pricing.estimatedPrintfulProductCostCents -
      pricing.stripeFeeEstimateCents -
      pricing.refundReserveCents;
    const optionId = randomUUID();
    const designLane =
      sourceOption?.designLane ??
      (isMerchDesignLane(sourceCard.learning.styleLane)
        ? sourceCard.learning.styleLane
        : 'fashion_graphic_item');
    const title = buildAlternativeDesignName(
      sourceCard.title,
      catalog.productType
    );
    const learning = {
      ...(sourceOption?.learning ?? sourceCard.learning),
      garmentColor: catalog.colorway,
      selectedOverOptionIds: [],
    };

    const [option] = await db
      .insert(merchDesignOptions)
      .values({
        id: optionId,
        generationBatchId: generationId,
        creatorProfileId: params.profileId,
        optionNumber: 1,
        status: 'selected',
        designLane,
        designName: title,
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
        concept: sourceCard.description,
        whyItFits:
          sourceOption?.whyItFits ??
          'It keeps the approved design and moves it onto a different Printful product.',
        mockupUrls: [],
        printFileUrls: [printFileUrl],
        productionWarnings: providerWarnings,
        qualityReview: sourceOption?.qualityReview ?? {
          copyrightRisk: 'low',
          typography: 'deterministic',
          printFeasible: true,
        },
        learning,
      })
      .returning();

    const printful = buildPrintfulSnapshot({
      catalogProductId: option.printfulCatalogProductId,
      catalogVariantIds: option.printfulCatalogVariantIds,
      variantMap: option.variantMap,
      placements: option.placements,
      technique: option.technique,
      printFileUrl,
      availabilityRegion: catalog.availabilityRegion,
      shippingProfile: catalog.shippingProfile,
      productName: option.printfulProductName,
      pricing: option.pricing,
      providerWarnings,
    });

    const [card] = await db
      .insert(merchCards)
      .values({
        creatorProfileId: params.profileId,
        createdByClerkUserId: params.clerkUserId,
        selectedDesignOptionId: option.id,
        status: 'draft',
        title,
        description: sourceCard.description,
        productType: option.productType,
        primaryImageUrl: printFileUrl,
        mockupUrls: [],
        printful,
        currency: 'USD',
        retailPriceCents: option.retailPriceCents,
        estimatedPrintfulProductCostCents:
          option.estimatedPrintfulProductCostCents,
        estimatedShippingCostCents: option.estimatedShippingCostCents,
        platformFeeCents: 0,
        artistRoyaltyRateBps: option.pricing.artistRoyaltyRateBps,
        artistPayoutPerUnitEstimateCents: option.artistShareCents,
        jovieMarginPerUnitEstimateCents: option.jovieShareCents,
        pricing: option.pricing,
        rankScore: 50,
        learning,
      })
      .returning();

    await db
      .update(merchGenerationBatches)
      .set({
        selectedOptionId: option.id,
        selectedMerchCardId: card.id,
        completedAt: new Date(),
        status: 'ready',
      })
      .where(eq(merchGenerationBatches.id, generationId));

    attachPrintfulMockupsAsync([option]);

    return {
      success: true,
      merchCardId: card.id,
      status: card.status,
      selectedOptionId: option.id,
      title: card.title,
      publicUrl: null,
      sourceMerchCardId: sourceCard.id,
      productType: option.productType,
      printfulProductName: option.printfulProductName,
    };
  } catch (error) {
    await db
      .update(merchGenerationBatches)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown merch error',
        completedAt: new Date(),
      })
      .where(eq(merchGenerationBatches.id, generationId));
    throw error;
  }
}

export async function publishMerchCard(params: {
  readonly cardId: string;
  readonly profileId: string;
  readonly clerkUserId: string;
}): Promise<MerchCard> {
  await assertCanManageMerchProfile(params.profileId, params.clerkUserId);
  const [current] = await db
    .select()
    .from(merchCards)
    .where(
      and(
        eq(merchCards.id, params.cardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .limit(1);
  if (!current) throw new Error('Merch card not found');
  // Cards generated before Printful cost hydration can still publish once costs refresh.
  const hydrated = await hydrateMerchCardPrintfulEconomics(current);
  validateMerchCardForPublishing(hydrated);

  const [card] = await db
    .update(merchCards)
    .set({ status: 'live', publishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(merchCards.id, params.cardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .returning();
  if (!card) throw new Error('Merch card not found');

  const [profile] = await db
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, card.creatorProfileId))
    .limit(1);
  if (profile) revalidatePublicProfile(profile.usernameNormalized);
  return card;
}

export async function updateMerchCardDetails(params: {
  readonly cardId: string;
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly retailPriceCents?: number | null;
  readonly primaryImageUrl?: string | null;
  readonly makeLive?: boolean;
}): Promise<MerchCard> {
  await assertCanManageMerchProfile(params.profileId, params.clerkUserId);
  const [current] = await db
    .select()
    .from(merchCards)
    .where(
      and(
        eq(merchCards.id, params.cardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .limit(1);
  if (!current) throw new Error('Merch card not found');

  const nextRetailPriceCents =
    params.retailPriceCents ?? current.retailPriceCents;
  const nextPricing =
    params.retailPriceCents === undefined || params.retailPriceCents === null
      ? current.pricing
      : buildMerchPricingSnapshot({
          retailPriceCents: nextRetailPriceCents,
          printfulProductCostCents: current.estimatedPrintfulProductCostCents,
          shippingCostCents: current.estimatedShippingCostCents,
          refundReserveCents: current.pricing.refundReserveCents,
          artistRoyaltyRateBps: current.artistRoyaltyRateBps,
          printfulCostSource: current.pricing.printfulCostSource ?? null,
          printfulCostUpdatedAt: current.pricing.printfulCostUpdatedAt ?? null,
        });
  const nextImageUrl =
    params.primaryImageUrl?.trim() || current.primaryImageUrl;
  const nextMockupUrls =
    params.primaryImageUrl?.trim() && !current.mockupUrls.includes(nextImageUrl)
      ? [nextImageUrl, ...current.mockupUrls]
      : current.mockupUrls;
  const wantsLive = params.makeLive === true || current.status === 'live';
  const candidate: MerchCard = {
    ...current,
    title: params.title?.trim() || current.title,
    description: params.description?.trim() || current.description,
    primaryImageUrl: nextImageUrl,
    mockupUrls: nextMockupUrls,
    retailPriceCents: nextPricing.retailPriceCents,
    estimatedPrintfulProductCostCents:
      nextPricing.estimatedPrintfulProductCostCents,
    estimatedShippingCostCents: nextPricing.estimatedShippingCostCents,
    artistPayoutPerUnitEstimateCents:
      nextPricing.artistPayoutPerUnitEstimateCents,
    jovieMarginPerUnitEstimateCents:
      nextPricing.jovieMarginPerUnitEstimateCents,
    pricing: nextPricing,
    status: wantsLive ? 'live' : current.status,
    publishedAt:
      wantsLive && current.status !== 'live' ? new Date() : current.publishedAt,
  };

  if (wantsLive) {
    validateMerchCardForPublishing(candidate);
  }

  const [card] = await db
    .update(merchCards)
    .set({
      title: candidate.title,
      description: candidate.description,
      primaryImageUrl: candidate.primaryImageUrl,
      mockupUrls: candidate.mockupUrls,
      retailPriceCents: candidate.retailPriceCents,
      estimatedPrintfulProductCostCents:
        candidate.estimatedPrintfulProductCostCents,
      estimatedShippingCostCents: candidate.estimatedShippingCostCents,
      artistPayoutPerUnitEstimateCents:
        candidate.artistPayoutPerUnitEstimateCents,
      jovieMarginPerUnitEstimateCents:
        candidate.jovieMarginPerUnitEstimateCents,
      pricing: candidate.pricing,
      status: candidate.status,
      publishedAt: candidate.publishedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(merchCards.id, params.cardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .returning();
  if (!card) throw new Error('Merch card not found');

  const usernameNormalized = await getProfileUsernameNormalized(
    card.creatorProfileId
  );
  if (usernameNormalized) {
    revalidatePublicProfile(usernameNormalized);
  }
  return card;
}

export async function updateMerchCardStatus(params: {
  readonly cardId: string;
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly status: 'paused' | 'archived' | 'live';
}): Promise<MerchCard> {
  const now = new Date();
  await assertCanManageMerchProfile(params.profileId, params.clerkUserId);
  if (params.status === 'live') {
    const [current] = await db
      .select()
      .from(merchCards)
      .where(
        and(
          eq(merchCards.id, params.cardId),
          eq(merchCards.creatorProfileId, params.profileId)
        )
      )
      .limit(1);
    if (!current) throw new Error('Merch card not found');
    validateMerchCardForPublishing(current);
  }
  const nextValues =
    params.status === 'live'
      ? {
          status: params.status,
          updatedAt: now,
          pausedAt: null,
          archivedAt: null,
          publishedAt: now,
        }
      : {
          status: params.status,
          updatedAt: now,
          pausedAt: params.status === 'paused' ? now : null,
          archivedAt: params.status === 'archived' ? now : null,
        };
  const [card] = await db
    .update(merchCards)
    .set(nextValues)
    .where(
      and(
        eq(merchCards.id, params.cardId),
        eq(merchCards.creatorProfileId, params.profileId)
      )
    )
    .returning();
  if (!card) throw new Error('Merch card not found');

  const [profile] = await db
    .select({ usernameNormalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, card.creatorProfileId))
    .limit(1);
  if (profile) revalidatePublicProfile(profile.usernameNormalized);
  return card;
}

export async function getLiveMerchCardsForProfile(
  profileId: string
): Promise<PublicMerchCard[]> {
  const cards = await db
    .select()
    .from(merchCards)
    .where(
      and(
        eq(merchCards.creatorProfileId, profileId),
        eq(merchCards.status, 'live')
      )
    )
    .orderBy(
      desc(merchCards.pinned),
      asc(merchCards.position),
      desc(merchCards.rankScore),
      desc(merchCards.createdAt)
    )
    .limit(6);

  return cards.map(toPublicMerchCard);
}

export async function getLibraryMerchCardsForProfile(
  profileId: string
): Promise<LibraryMerchCard[]> {
  const cards = await db
    .select()
    .from(merchCards)
    .where(
      and(
        eq(merchCards.creatorProfileId, profileId),
        ne(merchCards.status, 'archived')
      )
    )
    .orderBy(
      desc(merchCards.pinned),
      asc(merchCards.position),
      desc(merchCards.rankScore),
      desc(merchCards.updatedAt)
    )
    .limit(100);

  return cards.map(toLibraryMerchCard);
}

export async function getPublicMerchCard(params: {
  readonly username: string;
  readonly merchCardId: string;
}): Promise<{
  readonly profile: CreatorProfileForMerch;
  readonly card: PublicMerchCard;
} | null> {
  const [row] = await db
    .select({
      profile: {
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        bio: creatorProfiles.bio,
        genres: creatorProfiles.genres,
        location: creatorProfiles.location,
        spotifyFollowers: creatorProfiles.spotifyFollowers,
        spotifyPopularity: creatorProfiles.spotifyPopularity,
      },
      card: merchCards,
    })
    .from(creatorProfiles)
    .innerJoin(merchCards, eq(merchCards.creatorProfileId, creatorProfiles.id))
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, params.username.toLowerCase()),
        eq(creatorProfiles.isPublic, true),
        eq(merchCards.id, params.merchCardId),
        eq(merchCards.status, 'live')
      )
    )
    .limit(1);

  if (!row) return null;
  return { profile: row.profile, card: toPublicMerchCard(row.card) };
}

export async function incrementMerchCardView(cardId: string): Promise<void> {
  await db
    .update(merchCards)
    .set({
      views: drizzleSql`${merchCards.views} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(merchCards.id, cardId));
}

export async function incrementMerchCardClick(cardId: string): Promise<void> {
  await db
    .update(merchCards)
    .set({
      clicks: drizzleSql`${merchCards.clicks} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(merchCards.id, cardId));
}

export async function showMerchSales(profileId: string): Promise<{
  readonly grossRevenueCents: number;
  readonly purchases: number;
  readonly liveCards: number;
}> {
  const [summary] = await db
    .select({
      grossRevenueCents: drizzleSql<number>`COALESCE(SUM(${merchCards.grossRevenueCents}), 0)::int`,
      purchases: drizzleSql<number>`COALESCE(SUM(${merchCards.purchases}), 0)::int`,
      liveCards: drizzleSql<number>`COUNT(*) FILTER (WHERE ${merchCards.status} = 'live')::int`,
    })
    .from(merchCards)
    .where(eq(merchCards.creatorProfileId, profileId));

  return summary ?? { grossRevenueCents: 0, purchases: 0, liveCards: 0 };
}

export async function reorderMerchCards(params: {
  readonly profileId: string;
  readonly merchCardIds: readonly string[];
}): Promise<{
  readonly updated: number;
  readonly merchCardIds: readonly string[];
}> {
  const now = new Date();
  let updated = 0;

  for (const [position, merchCardId] of params.merchCardIds.entries()) {
    const [card] = await db
      .update(merchCards)
      .set({ position, pinned: true, updatedAt: now })
      .where(
        and(
          eq(merchCards.id, merchCardId),
          eq(merchCards.creatorProfileId, params.profileId)
        )
      )
      .returning({ id: merchCards.id });

    if (card) {
      updated++;
    }
  }

  await db
    .update(merchCards)
    .set({ pinned: false, position: null, updatedAt: now })
    .where(
      params.merchCardIds.length > 0
        ? and(
            eq(merchCards.creatorProfileId, params.profileId),
            notInArray(merchCards.id, [...params.merchCardIds])
          )
        : eq(merchCards.creatorProfileId, params.profileId)
    );

  const usernameNormalized = await getProfileUsernameNormalized(
    params.profileId
  );
  if (usernameNormalized) {
    revalidatePublicProfile(usernameNormalized);
  }

  return { updated, merchCardIds: params.merchCardIds };
}

export async function optimizeMerchCards(profileId: string): Promise<{
  readonly optimized: number;
}> {
  const cards = await db
    .select({ id: merchCards.id })
    .from(merchCards)
    .where(
      and(
        eq(merchCards.creatorProfileId, profileId),
        eq(merchCards.status, 'live')
      )
    );

  for (const card of cards) {
    await refreshMerchRank(card.id);
  }

  const usernameNormalized = await getProfileUsernameNormalized(profileId);
  if (usernameNormalized) {
    revalidatePublicProfile(usernameNormalized);
  }

  return { optimized: cards.length };
}

export async function showArtistPayouts(profileId: string): Promise<{
  readonly accruedCents: number;
  readonly readyCents: number;
  readonly paidCents: number;
}> {
  const [summary] = await db
    .select({
      accruedCents: drizzleSql<number>`COALESCE(SUM(${merchPayoutLedgerEntries.artistShareCents}) FILTER (WHERE ${merchPayoutLedgerEntries.payoutStatus} IN ('accrued', 'held_for_refund_window')), 0)::int`,
      readyCents: drizzleSql<number>`COALESCE(SUM(${merchPayoutLedgerEntries.artistShareCents}) FILTER (WHERE ${merchPayoutLedgerEntries.payoutStatus} = 'ready_to_pay'), 0)::int`,
      paidCents: drizzleSql<number>`COALESCE(SUM(${merchPayoutLedgerEntries.artistShareCents}) FILTER (WHERE ${merchPayoutLedgerEntries.payoutStatus} = 'paid_manually'), 0)::int`,
    })
    .from(merchPayoutLedgerEntries)
    .where(eq(merchPayoutLedgerEntries.creatorProfileId, profileId));

  return summary ?? { accruedCents: 0, readyCents: 0, paidCents: 0 };
}

export async function refreshMerchRank(cardId: string): Promise<void> {
  const [card] = await db
    .select()
    .from(merchCards)
    .where(eq(merchCards.id, cardId))
    .limit(1);
  if (!card) return;
  await db
    .update(merchCards)
    .set({ rankScore: calculateRankScore(card), updatedAt: new Date() })
    .where(eq(merchCards.id, cardId));
}

export function resolveVariantId(
  variantMap: MerchVariantMap,
  variantKey: string
): number | null {
  return variantMap[variantKey] ?? null;
}

export { optionToView };
