import { afterAll, vi } from 'vitest';
import type {
  MerchCard,
  MerchDesignOption,
  MerchLearningSnapshot,
  MerchPricingSnapshot,
  MerchPrintfulSnapshot,
} from '@/lib/db/schema/merch';

const testNow = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
  return Date.now();
});

afterAll(() => vi.useRealTimers());

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
const freshCostUpdatedAt = new Date(testNow - 60_000).toISOString();

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

export {
  CARD_ID,
  CATALOG_PRODUCT_ID,
  CLERK_USER_ID,
  dbHarness,
  GENERATION_ID,
  generation,
  makeCard,
  makeOption,
  makePrintfulSnapshot,
  OPTION_ID,
  OTHER_OPTION_ID,
  PROFILE_ID,
  printfulPricing,
  profile,
  queuePostClaimWrites,
  queuePreclaimReads,
};
