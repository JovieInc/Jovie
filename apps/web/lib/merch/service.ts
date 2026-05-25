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
  type MerchPrintfulSnapshot,
  type MerchVariantMap,
  merchCards,
  merchDesignOptions,
  merchGenerationBatches,
  merchPayoutLedgerEntries,
} from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { createMerchArtwork } from './artwork';
import {
  getDefaultVariantIds,
  MERCH_DEFAULT_PRINTFUL_PRODUCT,
} from './default-catalog';
import { buildMerchPricingSnapshot, formatMerchMoney } from './pricing';
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

function buildOptionSpecs(profile: CreatorProfileForMerch): MerchOptionSpec[] {
  const name = artistName(profile);
  const genre = profile.genres?.[0] ?? 'independent';
  const city = profile.location ?? 'the scene';

  return [
    {
      lane: 'band_tour_uniform',
      designName: `${name} Signal Tee`,
      concept: `A real-show uniform built around ${name} with heavyweight front typography and no fake dates.`,
      whyItFits: `It gives ${name} a clear merch-table object without inventing tour claims.`,
      typographyStyle: 'stacked venue typography',
      density: 'maximal',
      motifs: [genre, city, 'signal grid'],
    },
    {
      lane: 'fashion_graphic_item',
      designName: `${name} Object Tee`,
      concept:
        'A restrained fashion graphic item that reads as a premium tee first and artist merch second.',
      whyItFits:
        'It is wearable for fans who want taste and context without a loud logo.',
      typographyStyle: 'quiet capsule typography',
      density: 'minimal',
      motifs: [genre, 'capsule object'],
    },
    {
      lane: 'artist_world_artifact',
      designName: `${name} Archive Tee`,
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

function buildLearningSnapshot(
  spec: MerchOptionSpec,
  selectedOverOptionIds: string[] = []
): MerchLearningSnapshot {
  return {
    styleLane: spec.lane,
    typographyStyle: spec.typographyStyle,
    graphicDensity: spec.density,
    garmentColor: MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
    motifs: spec.motifs,
    selectedOverOptionIds,
    rejectedAttributes: [],
  };
}

function buildPrintfulSnapshot(printFileUrl: string): MerchPrintfulSnapshot {
  return {
    catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
    catalogVariantIds: getDefaultVariantIds(),
    variantMap: MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap,
    placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
    techniques: [MERCH_DEFAULT_PRINTFUL_PRODUCT.technique],
    printFileUrls: [printFileUrl],
    availabilityRegion: MERCH_DEFAULT_PRINTFUL_PRODUCT.availabilityRegion,
    shippingProfile: MERCH_DEFAULT_PRINTFUL_PRODUCT.shippingProfile,
  };
}

function validatePrintfulSnapshotForPublishing(
  printful: MerchPrintfulSnapshot
): string[] {
  const errors: string[] = [];
  if (!printful.catalogProductId) {
    errors.push('missing Printful catalog product id');
  }
  if (printful.catalogVariantIds.length === 0) {
    errors.push('missing Printful catalog variant ids');
  }
  if (Object.keys(printful.variantMap).length === 0) {
    errors.push('missing Printful variant map');
  }
  if (printful.placements.length === 0) {
    errors.push('missing Printful placements');
  }
  if (printful.techniques.length === 0) {
    errors.push('missing Printful print technique');
  }
  if (printful.printFileUrls.length === 0) {
    errors.push('missing print files');
  }
  if (printful.availabilityRegion !== 'US') {
    errors.push('unsupported availability region');
  }
  return errors;
}

function validateDesignOptionForPublishing(option: MerchDesignOption): void {
  const printful = buildPrintfulSnapshot(option.printFileUrls[0] ?? '');
  const errors = validatePrintfulSnapshotForPublishing(printful);
  if (option.mockupUrls.length === 0) {
    errors.push('missing mockups');
  }
  if (option.printFileUrls.length === 0) {
    errors.push('missing design print files');
  }
  if (option.retailPriceCents <= 0) {
    errors.push('invalid retail price');
  }
  if (option.productionWarnings.length > 0) {
    errors.push('unresolved production warnings');
  }
  if (errors.length > 0) {
    throw new Error(`Merch card cannot be published: ${errors.join(', ')}`);
  }
}

function validateMerchCardForPublishing(card: MerchCard): void {
  const errors = validatePrintfulSnapshotForPublishing(card.printful);
  if (!card.primaryImageUrl || card.mockupUrls.length === 0) {
    errors.push('missing mockups');
  }
  if (card.currency !== 'USD') {
    errors.push('unsupported currency');
  }
  if (card.retailPriceCents <= 0) {
    errors.push('invalid retail price');
  }
  if (card.artistRoyaltyRateBps < 0 || card.artistRoyaltyRateBps > 10_000) {
    errors.push('invalid artist royalty rate');
  }
  if (errors.length > 0) {
    throw new Error(`Merch card cannot be published: ${errors.join(', ')}`);
  }
}

function optionToView(option: MerchDesignOption): MerchGenerationOptionView {
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
    price_recommendation: {
      retail_price: formatMerchMoney(option.retailPriceCents),
      estimated_printful_cost: formatMerchMoney(
        option.estimatedPrintfulProductCostCents
      ),
      estimated_shipping: formatMerchMoney(option.estimatedShippingCostCents),
      estimated_gross_margin: formatMerchMoney(
        option.estimatedGrossMarginCents
      ),
      artist_share: formatMerchMoney(option.artistShareCents),
      jovie_share: formatMerchMoney(option.jovieShareCents),
    },
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
    const pricing = buildMerchPricingSnapshot();
    const specs = buildOptionSpecs(profile);
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
          productType: MERCH_DEFAULT_PRINTFUL_PRODUCT.productType,
          printfulProductName: MERCH_DEFAULT_PRINTFUL_PRODUCT.productName,
          printfulCatalogProductId:
            MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
          printfulCatalogVariantIds: getDefaultVariantIds(),
          variantMap: MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap,
          colorway: MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
          availableSizes: MERCH_DEFAULT_PRINTFUL_PRODUCT.sizes,
          placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
          technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
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
          productionWarnings: [],
          qualityReview: {
            copyrightRisk: 'low',
            typography: 'deterministic',
            printFeasible: true,
          },
          learning: buildLearningSnapshot(spec),
        })
        .returning();

      insertedOptions.push(option);
    }

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

export async function selectMerchDesign(params: {
  readonly generationId: string;
  readonly clerkUserId: string;
  readonly optionId?: string | null;
  readonly optionNumber?: number | null;
  readonly publish?: boolean;
}): Promise<MerchSelectionResult> {
  const selected = await getOptionForSelection(params);
  await assertCanManageMerchProfile(
    selected.creatorProfileId,
    params.clerkUserId
  );
  const profile = await getCreatorProfileForMerch(selected.creatorProfileId);
  if (params.publish) {
    validateDesignOptionForPublishing(selected);
  }

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
    const printful = buildPrintfulSnapshot(selected.printFileUrls[0] ?? '');

    const [inserted] = await db
      .insert(merchCards)
      .values({
        creatorProfileId: selected.creatorProfileId,
        createdByClerkUserId: params.clerkUserId,
        selectedDesignOptionId: selected.id,
        status: params.publish ? 'live' : 'draft',
        title: selected.designName,
        description: selected.concept,
        productType: selected.productType,
        primaryImageUrl: selected.mockupUrls[0] ?? '',
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
        publishedAt: params.publish ? new Date() : null,
      })
      .returning();
    card = inserted;
  } else if (params.publish && card.status !== 'live') {
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
  };
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
  validateMerchCardForPublishing(current);

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
