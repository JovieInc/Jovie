import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MerchCard,
  MerchDesignOption,
  MerchLearningSnapshot,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';
import { createMerchArtwork } from './artwork';
import { resolveMerchCatalogSelection } from './catalog';
import { MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER } from './generation-contract';
import {
  createMerchGeneration,
  publishMerchCard,
  selectMerchDesign,
  updateMerchCardDetails,
  updateMerchCardStatus,
} from './service';

/**
 * Queue-driven mock for the drizzle `db` client. Every awaited query in
 * `selectMerchDesign` drains exactly one queued result, whether it ends in
 * `.limit(n)`, `.returning()`, or a bare awaited `.where(...)`.
 */
const dbHarness = vi.hoisted(() => {
  const results: unknown[] = [];
  const calls: { method: string; args: unknown[] }[] = [];

  function makeChain(): unknown {
    const chain = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (
              resolve: (value: unknown) => unknown,
              reject?: (reason: unknown) => unknown
            ) => Promise.resolve(results.shift()).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args });
            if (prop === 'limit' || prop === 'returning') {
              return Promise.resolve(results.shift() ?? []);
            }
            return chain;
          };
        },
      }
    );
    return chain;
  }

  const db = {
    select: () => {
      calls.push({ method: 'select', args: [] });
      return makeChain();
    },
    insert: () => {
      calls.push({ method: 'insert', args: [] });
      return makeChain();
    },
    update: () => {
      calls.push({ method: 'update', args: [] });
      return makeChain();
    },
    delete: () => {
      calls.push({ method: 'delete', args: [] });
      return makeChain();
    },
  };

  return {
    db,
    calls,
    queue: (value: unknown) => {
      results.push(value);
    },
    countCalls: (method: string) =>
      calls.filter(call => call.method === method).length,
    /** First arguments of every recorded call to a query-builder method (e.g. `values`, `set`) — the persisted write payloads. */
    methodArgs: (method: string) =>
      calls.filter(call => call.method === method).map(call => call.args[0]),
    reset: () => {
      results.length = 0;
      calls.length = 0;
    },
  };
});

vi.mock('@/lib/db', () => ({ db: dbHarness.db }));

vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: vi.fn(async () => ({ id: 'profile-id' })),
}));

vi.mock('./catalog', () => ({
  listMerchCatalogProductOptions: vi.fn(async () => []),
  resolveLiveMerchCatalogProduct: vi.fn(),
  resolveMerchCatalogSelection: vi.fn(),
}));

vi.mock('./mockup-enrichment', () => ({
  scheduleMerchMockupEnrichment: vi.fn(),
}));

vi.mock('./artwork', () => ({
  createMerchArtwork: vi.fn(async () => ({
    mockupUrl: 'https://files.example.com/mockup.png',
    printFileUrl: 'https://files.example.com/print.png',
  })),
}));

const GENERATION_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_OPTION_ID = '33333333-3333-4333-8333-333333333333';
const PROFILE_ID = '44444444-4444-4444-8444-444444444444';
const CARD_ID = '55555555-5555-4555-8555-555555555555';
const CLERK_USER_ID = 'clerk_test_user';
const CATALOG_PRODUCT_ID = 71;
const MOCKUP_URL = 'https://files.printful.com/mockups/option-1.png';

const learningSnapshot: MerchLearningSnapshot = {
  styleLane: 'minimal',
  typographyStyle: 'condensed',
  graphicDensity: 'minimal',
  garmentColor: 'black',
  motifs: [],
  selectedOverOptionIds: [],
  rejectedAttributes: [],
};

// Fresh provider-snapshot timestamp so cost freshness never masks the
// mockup-status gate under test (sellability must pass on economics).
const freshCostUpdatedAt = new Date(Date.now() - 60_000).toISOString();

const printfulPricing: MerchPricingSnapshot = {
  currency: 'USD',
  retailPriceCents: 4000,
  estimatedPrintfulProductCostCents: 1800,
  estimatedShippingCostCents: 400,
  stripeFeeEstimateCents: 150,
  refundReserveCents: 100,
  artistRoyaltyRateBps: 5000,
  artistPayoutPerUnitEstimateCents: 1200,
  jovieMarginPerUnitEstimateCents: 550,
  printfulCostSource: 'printful',
  printfulCostUpdatedAt: freshCostUpdatedAt,
};

function makePrintfulSnapshot(
  overrides: Partial<MerchPrintfulSnapshot> = {}
): MerchPrintfulSnapshot {
  return {
    catalogProductId: CATALOG_PRODUCT_ID,
    catalogVariantIds: [4016],
    variantMap: { '4016': 0 },
    placements: ['front'],
    techniques: ['dtg'],
    printFileUrls: ['https://files.example.com/print.png'],
    availabilityRegion: 'US',
    shippingProfile: 'default',
    catalogCostSource: 'printful',
    catalogCostUpdatedAt: freshCostUpdatedAt,
    catalogProductName: 'Bella+Canvas 3001',
    providerWarnings: [],
    ...overrides,
  };
}

function makeOption(
  overrides: Partial<MerchDesignOption> = {}
): MerchDesignOption {
  return {
    id: OPTION_ID,
    generationBatchId: GENERATION_ID,
    creatorProfileId: PROFILE_ID,
    optionNumber: 1,
    status: 'candidate',
    designLane: 'fashion_graphic_item',
    designName: 'Signal Tee',
    productType: 'tshirt',
    printfulProductName: 'Bella+Canvas 3001',
    printfulCatalogProductId: CATALOG_PRODUCT_ID,
    printfulCatalogVariantIds: [4016],
    variantMap: { '4016': 0 },
    colorway: 'black',
    availableSizes: ['M'],
    placements: ['front'],
    technique: 'dtg',
    retailPriceCents: 4000,
    estimatedPrintfulProductCostCents: 1800,
    estimatedShippingCostCents: 400,
    estimatedGrossMarginCents: 1750,
    artistShareCents: 1200,
    jovieShareCents: 550,
    pricing: printfulPricing,
    concept: 'Static bloom motif',
    whyItFits: 'Matches the single artwork',
    mockupUrls: [MOCKUP_URL],
    printFileUrls: ['https://files.example.com/print.png'],
    productionWarnings: [],
    qualityReview: {},
    learning: learningSnapshot,
    remediationOfOptionId: null,
    remediationInstruction: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCard(overrides: Partial<MerchCard> = {}): MerchCard {
  return {
    id: CARD_ID,
    creatorProfileId: PROFILE_ID,
    createdByClerkUserId: CLERK_USER_ID,
    selectedDesignOptionId: OPTION_ID,
    status: 'draft',
    title: 'Signal Tee',
    description: 'Static bloom motif',
    productType: 'tshirt',
    primaryImageUrl: MOCKUP_URL,
    mockupUrls: [MOCKUP_URL],
    printful: makePrintfulSnapshot(),
    currency: 'USD',
    retailPriceCents: 4000,
    estimatedPrintfulProductCostCents: 1800,
    estimatedShippingCostCents: 400,
    platformFeeCents: 0,
    artistRoyaltyRateBps: 5000,
    artistPayoutPerUnitEstimateCents: 1200,
    jovieMarginPerUnitEstimateCents: 550,
    pricing: printfulPricing,
    rankScore: 50,
    position: null,
    pinned: false,
    visibilityRules: {
      public: true,
      fanSegments: [],
      geoRules: [],
      inventoryRules: [],
    },
    views: 0,
    clicks: 0,
    addToCarts: 0,
    purchases: 0,
    grossRevenueCents: 0,
    grossMarginCents: 0,
    artistPayoutAccruedCents: 0,
    learning: learningSnapshot,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    publishedAt: null,
    pausedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

const option = makeOption();
const generation = {
  artistBrief: {
    forbidden_cliches: ['No people, faces, portraits, or models'],
    source: { sourceType: 'song_title', sourceText: 'Static Bloom' },
  },
};
const profile = {
  id: PROFILE_ID,
  username: 'timwhite',
  usernameNormalized: 'timwhite',
  displayName: 'Tim White',
  bio: null,
  genres: null,
  location: null,
  spotifyFollowers: null,
  spotifyPopularity: null,
};

/**
 * Queue the standard pre-claim reads: option lookup, generation batch,
 * existing-card check, then the creator profile read that happens after
 * option hydration early-returns on printful-sourced fixtures.
 */
function queuePreclaimReads(existingCard: MerchCard | null) {
  dbHarness.queue([option]);
  dbHarness.queue([generation]);
  dbHarness.queue(existingCard ? [existingCard] : []);
  dbHarness.queue([profile]);
}

function queuePostClaimWrites() {
  // merchDesignOptions -> selected, merchDesignOptions -> rejected,
  // merchGenerationBatches -> selected card link. All awaited via .where().
  dbHarness.queue(undefined);
  dbHarness.queue(undefined);
  dbHarness.queue(undefined);
}

describe('selectMerchDesign one-card-per-option', () => {
  beforeEach(() => {
    dbHarness.reset();
  });

  it('reuses the canonical card on a sequential same-product retry', async () => {
    const canonical = makeCard();
    queuePreclaimReads(canonical);
    queuePostClaimWrites();

    const result = await selectMerchDesign({
      generationId: GENERATION_ID,
      clerkUserId: CLERK_USER_ID,
      optionId: OPTION_ID,
      catalogProductId: CATALOG_PRODUCT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.merchCardId).toBe(CARD_ID);
    expect(dbHarness.countCalls('insert')).toBe(0);
  });

  it('returns the canonical card when a concurrent select wins the claim', async () => {
    const canonical = makeCard();
    queuePreclaimReads(null);
    dbHarness.queue([{ id: OTHER_OPTION_ID }]); // rejected siblings
    dbHarness.queue([]); // insert().onConflictDoNothing().returning() -> lost
    dbHarness.queue([canonical]); // canonical re-read after losing the race
    queuePostClaimWrites();

    const result = await selectMerchDesign({
      generationId: GENERATION_ID,
      clerkUserId: CLERK_USER_ID,
      optionId: OPTION_ID,
      catalogProductId: CATALOG_PRODUCT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.merchCardId).toBe(CARD_ID);
    // The returned snapshot is the winner's canonical economics/product.
    expect(result.product?.productName).toBe('Bella+Canvas 3001');
    expect(result.product?.retailPrice).toBe('$40.00');
    // Exactly one insert attempted, through the conflict-safe claim path.
    expect(dbHarness.countCalls('insert')).toBe(1);
    expect(dbHarness.countCalls('onConflictDoNothing')).toBe(1);
  });

  it('throws the deterministic product-conflict error for a losing conflicting product', async () => {
    const canonical = makeCard({
      printful: makePrintfulSnapshot({ catalogProductId: 999 }),
    });
    queuePreclaimReads(null);
    dbHarness.queue([{ id: OTHER_OPTION_ID }]);
    dbHarness.queue([]); // lost the claim race
    dbHarness.queue([canonical]); // winner's card carries a different product

    await expect(
      selectMerchDesign({
        generationId: GENERATION_ID,
        clerkUserId: CLERK_USER_ID,
        optionId: OPTION_ID,
        catalogProductId: CATALOG_PRODUCT_ID,
      })
    ).rejects.toThrow('A product is already selected for this merch design');
    expect(dbHarness.countCalls('insert')).toBe(1);
    expect(dbHarness.countCalls('onConflictDoNothing')).toBe(1);
  });

  it('inserts exactly one card when this call wins the claim', async () => {
    const card = makeCard();
    queuePreclaimReads(null);
    dbHarness.queue([{ id: OTHER_OPTION_ID }]);
    dbHarness.queue([card]); // insert().returning() -> won
    queuePostClaimWrites();

    const result = await selectMerchDesign({
      generationId: GENERATION_ID,
      clerkUserId: CLERK_USER_ID,
      optionId: OPTION_ID,
      catalogProductId: CATALOG_PRODUCT_ID,
    });

    expect(result.merchCardId).toBe(CARD_ID);
    expect(dbHarness.countCalls('insert')).toBe(1);
    expect(dbHarness.countCalls('onConflictDoNothing')).toBe(1);
  });
});

describe('createMerchGeneration generalized lane copy', () => {
  beforeEach(() => {
    dbHarness.reset();
    vi.mocked(createMerchArtwork).mockClear();
    vi.mocked(resolveMerchCatalogSelection).mockResolvedValue({
      catalogProductId: CATALOG_PRODUCT_ID,
      productName: 'Bella+Canvas 3001',
      productType: 'tshirt',
      colorway: 'black',
      variantMap: { '4016': 0 },
      catalogVariantIds: [4016],
      sizes: ['M'],
      placements: ['front'],
      technique: 'dtg',
      availabilityRegion: 'US',
      shippingProfile: 'default',
      pricing: printfulPricing,
      providerWarnings: [],
    });
  });

  it('writes creator-agnostic briefs and option copy', async () => {
    dbHarness.queue([profile]); // getCreatorProfileForMerch
    dbHarness.queue([]); // getReleaseContext
    dbHarness.queue(undefined); // insert merchGenerationBatches
    dbHarness.queue([makeOption({ id: 'option-1' })]);
    dbHarness.queue([makeOption({ id: 'option-2' })]);
    dbHarness.queue([makeOption({ id: 'option-3' })]);
    dbHarness.queue(undefined); // update merchGenerationBatches -> ready

    const result = await createMerchGeneration({
      profileId: PROFILE_ID,
      clerkUserId: CLERK_USER_ID,
      prompt: 'make something for fans',
    });

    expect(result.success).toBe(true);
    expect(result.artistBrief.artist_myth).toContain(
      'independent creative work'
    );
    expect(result.artistBrief.best_merch_hypothesis).toContain(
      'creator naming'
    );
    expect(result.artistBrief.commercial_angle).toContain('creator merch');

    const artworkCalls = vi
      .mocked(createMerchArtwork)
      .mock.calls.map(([params]) => params);
    expect(artworkCalls.map(call => call.lane)).toEqual([
      'band_tour_uniform',
      'fashion_graphic_item',
      'artist_world_artifact',
    ]);
    const generatedCopy = artworkCalls
      .map(call => `${call.designName} ${call.concept}`)
      .join(' ');
    expect(generatedCopy).toContain('signature uniform');
    expect(generatedCopy).toContain('creator merch');
    expect(generatedCopy).toContain('creator world');
    expect(generatedCopy).not.toMatch(/tour|merch table|artist merch/i);
  });
});

describe('merch mockup publish eligibility', () => {
  beforeEach(() => {
    dbHarness.reset();
  });

  /**
   * Queue the pending-option select flow. Card echoes are queued for BOTH the
   * pre-fix and post-fix shapes: pre-fix, publish:true reaches the
   * set-status-live update (consuming the second echo); post-fix the card
   * stays a draft and the extra echo is left unconsumed.
   */
  function queuePendingSelectFlow(qualityReview: Record<string, unknown>) {
    const pendingOption = makeOption({ qualityReview });
    dbHarness.queue([pendingOption]); // option lookup
    dbHarness.queue([generation]); // generation batch
    dbHarness.queue([]); // existing card check
    dbHarness.queue([profile]); // creator profile
    dbHarness.queue([{ id: OTHER_OPTION_ID }]); // rejected siblings
    dbHarness.queue([makeCard()]); // insert().returning() -> won the claim
    dbHarness.queue([makeCard()]); // absorbed by the live-status update pre-fix
    queuePostClaimWrites();
  }

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'select with publish:true keeps a %s option a draft (persisted status, not later corrected)',
    async mockupStatus => {
      queuePendingSelectFlow({ mockupStatus });

      const result = await selectMerchDesign({
        generationId: GENERATION_ID,
        clerkUserId: CLERK_USER_ID,
        optionId: OPTION_ID,
        publish: true,
      });

      // The persisted insert itself must be a draft — this is the row that
      // was written, not a post-hoc correction of the in-memory result.
      expect(dbHarness.methodArgs('values')).toMatchObject([
        { status: 'draft' },
      ]);
      // No live-status write anywhere in the flow.
      for (const setArg of dbHarness.methodArgs('set')) {
        expect((setArg as { status?: string }).status).not.toBe('live');
      }
      const contract = await import('./generation-contract');
      const expectedBlocker =
        mockupStatus === 'pending_mockup'
          ? contract.MERCH_MOCKUP_PENDING_PUBLISH_BLOCKER
          : MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER;
      expect(result.product?.publishEligible).toBe(false);
      expect(result.publishBlockedReasons).toContain(expectedBlocker);
      expect(result.status).toBe('draft');
    }
  );

  it('selects a pending_mockup option as a draft when publish is not requested', async () => {
    queuePendingSelectFlow({ mockupStatus: 'pending_mockup' });

    const result = await selectMerchDesign({
      generationId: GENERATION_ID,
      clerkUserId: CLERK_USER_ID,
      optionId: OPTION_ID,
    });

    expect(result.success).toBe(true);
    expect(dbHarness.methodArgs('values')).toMatchObject([{ status: 'draft' }]);
    expect(result.status).toBe('draft');
  });

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'publishMerchCard refuses a card whose selected option is %s',
    async mockupStatus => {
      dbHarness.queue([makeCard()]); // card lookup
      dbHarness.queue([{ qualityReview: { mockupStatus } }]); // option quality review
      dbHarness.queue([makeCard({ status: 'live' })]); // update echo, never reached post-fix

      await expect(
        publishMerchCard({
          cardId: CARD_ID,
          profileId: PROFILE_ID,
          clerkUserId: CLERK_USER_ID,
        })
      ).rejects.toThrow('cannot be published');
      // The refusal happens before any write: no update .set() may occur.
      expect(dbHarness.methodArgs('set')).toEqual([]);
    }
  );

  it('publishes a legacy card whose option carries no mockup lifecycle stamp', async () => {
    dbHarness.queue([makeCard()]); // card lookup
    dbHarness.queue([{ qualityReview: {} }]); // option quality review: no stamp
    dbHarness.queue([makeCard({ status: 'live' })]); // update echo
    dbHarness.queue([{ usernameNormalized: 'timwhite' }]); // profile read for revalidate

    const card = await publishMerchCard({
      cardId: CARD_ID,
      profileId: PROFILE_ID,
      clerkUserId: CLERK_USER_ID,
    });

    expect(card.status).toBe('live');
    expect(dbHarness.methodArgs('set')).toMatchObject([{ status: 'live' }]);
  });

  it.each(['pending_mockup', 'mockup_failed'] as const)(
    'updateMerchCardStatus to live refuses a card whose selected option is %s',
    async mockupStatus => {
      dbHarness.queue([makeCard()]); // card lookup
      dbHarness.queue([{ qualityReview: { mockupStatus } }]); // option quality review

      await expect(
        updateMerchCardStatus({
          cardId: CARD_ID,
          profileId: PROFILE_ID,
          clerkUserId: CLERK_USER_ID,
          status: 'live',
        })
      ).rejects.toThrow('cannot be published');
      expect(dbHarness.methodArgs('set')).toEqual([]);
    }
  );

  it('updateMerchCardDetails makeLive refuses a pending_mockup option', async () => {
    dbHarness.queue([makeCard()]); // card lookup
    dbHarness.queue([{ qualityReview: { mockupStatus: 'pending_mockup' } }]); // option quality review

    await expect(
      updateMerchCardDetails({
        cardId: CARD_ID,
        profileId: PROFILE_ID,
        clerkUserId: CLERK_USER_ID,
        makeLive: true,
      })
    ).rejects.toThrow('cannot be published');
    expect(dbHarness.methodArgs('set')).toEqual([]);
  });
});
