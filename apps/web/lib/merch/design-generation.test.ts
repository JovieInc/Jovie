import { describe, expect, it, vi } from 'vitest';
import { reviewMerchContent } from './content-review';
import {
  buildMerchImagePrompt,
  formatMerchDesignConcept,
  generateMerchDesigns,
  MERCH_DESIGN_STRATEGIES,
  resolveMerchGenerationPrerequisites,
  selectionCountsToWeights,
  selectMerchDesignStrategies,
} from './design-generation';
import { scheduleMerchMockupEnrichment } from './mockup-enrichment';

/**
 * Queue-driven mock for the drizzle `db` client (same pattern as
 * lib/merch/service.test.ts). Shift order for the generateMerchDesigns
 * pre-claim reads: the artist-name select ends in `.limit()` (shifts
 * synchronously), then the recent-strategy select ends in `.limit()`
 * (synchronous), and the model-weights select ends in a bare awaited
 * chain (shifts in a microtask).
 */
const merchMocks = vi.hoisted(() => ({
  /** A resolved HOODIE catalog selection — deliberately distinct from the default tee (71). */
  hoodieCatalogSelection: {
    catalogProductId: 216,
    productName: 'Unisex Heavy Blend Hoodie',
    productType: 'hoodie',
    colorway: 'black',
    variantMap: { XL_black: 9519 },
    catalogVariantIds: [9519],
    sizes: ['S', 'M', 'L', 'XL'],
    placements: ['front'],
    technique: 'embroidery',
    availabilityRegion: 'US',
    shippingProfile: 'printful_standard_us',
    pricing: {
      currency: 'USD',
      retailPriceCents: 5500,
      estimatedPrintfulProductCostCents: 2200,
      estimatedShippingCostCents: 500,
      stripeFeeEstimateCents: 200,
      refundReserveCents: 120,
      artistRoyaltyRateBps: 5000,
      artistPayoutPerUnitEstimateCents: 1500,
      jovieMarginPerUnitEstimateCents: 980,
      printfulCostSource: 'printful',
      printfulCostUpdatedAt: new Date(Date.now() - 60_000).toISOString(),
    },
    providerWarnings: [],
  },
}));

const dbHarness = vi.hoisted(() => {
  const results: unknown[] = [];

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
            void args;
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
    select: () => makeChain(),
    insert: () => makeChain(),
    update: () => makeChain(),
    delete: () => makeChain(),
  };

  return {
    db,
    queue: (value: unknown) => {
      results.push(value);
    },
  };
});

vi.mock('@/lib/db', () => ({ db: dbHarness.db }));

vi.mock('./catalog', () => ({
  resolveMerchCatalogSelection: vi.fn(
    async () => merchMocks.hoodieCatalogSelection
  ),
  listMerchCatalogProductOptions: vi.fn(async () => []),
  resolveLiveMerchCatalogProduct: vi.fn(),
}));

vi.mock('./graphic-engine', () => ({
  generatePrintGraphic: vi.fn(
    async (params: { prompt: string; content?: { prompt?: string } }) => {
      const actual = await vi.importActual<{
        reviewMerchContent: typeof import('./content-review').reviewMerchContent;
      }>('./content-review');
      return {
        image: Buffer.from('print-png'),
        modelKey: 'gpt-image-1.5',
        modelId: 'test-model',
        mediaType: 'image/png',
        contentReview: actual.reviewMerchContent({
          prompt: params.content?.prompt ?? params.prompt,
        }),
      };
    }
  ),
}));

vi.mock('./mockup-engine', () => ({
  createGeneratedMerchArtwork: vi.fn(async () => ({
    printFileUrl: 'https://files.example.com/print.png',
    mockupUrl: 'https://files.example.com/mockup.png',
  })),
}));

vi.mock('./mockup-enrichment', () => ({
  scheduleMerchMockupEnrichment: vi.fn(),
}));

const source = {
  sourceType: 'song_title' as const,
  sourceText: 'Static Bloom',
  provenanceTitle: 'Static Bloom',
  rightsStatus: 'owned' as const,
};

describe('formatMerchDesignConcept', () => {
  it('appends a source suffix only when a source label is present', () => {
    expect(
      formatMerchDesignConcept('Signal Field', 'stadium tee graphic', null)
    ).toBe('Signal Field direction: stadium tee graphic');
    expect(
      formatMerchDesignConcept(
        'Signal Field',
        'stadium tee graphic',
        'song title: Static Bloom'
      )
    ).toBe(
      'Signal Field direction: stadium tee graphic · Source: song title: Static Bloom'
    );
  });
});

describe('selectionCountsToWeights', () => {
  it('is empty (equal weighting) with no selection history', () => {
    expect(selectionCountsToWeights([])).toEqual({});
  });

  it('Laplace-smooths: weight = 1 + picks', () => {
    expect(
      selectionCountsToWeights([
        { modelKey: 'gpt-image-1.5', count: 4 },
        { modelKey: 'recraft-v3', count: 1 },
      ])
    ).toEqual({ 'gpt-image-1.5': 5, 'recraft-v3': 2 });
  });

  it('skips rows with no recorded model (legacy designs)', () => {
    expect(
      selectionCountsToWeights([
        { modelKey: null, count: 9 },
        { modelKey: 'recraft-v3', count: 2 },
      ])
    ).toEqual({ 'recraft-v3': 3 });
  });

  it('never produces a zero/negative weight that could lock a model out', () => {
    const w = selectionCountsToWeights([
      { modelKey: 'gpt-image-1.5', count: 0 },
      { modelKey: 'recraft-v3', count: -3 },
    ]);
    for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveMerchGenerationPrerequisites', () => {
  it('starts independent reads together before any one resolves', async () => {
    let resolveArtist!: (value: string) => void;
    let resolveCatalog!: (value: string) => void;
    let resolveWeights!: (value: string) => void;
    const artistName = vi.fn(
      () => new Promise<string>(resolve => (resolveArtist = resolve))
    );
    const catalog = vi.fn(
      () => new Promise<string>(resolve => (resolveCatalog = resolve))
    );
    const modelWeights = vi.fn(
      () => new Promise<string>(resolve => (resolveWeights = resolve))
    );

    const result = resolveMerchGenerationPrerequisites({
      artistName,
      catalog,
      modelWeights,
    });

    expect(artistName).toHaveBeenCalledOnce();
    expect(catalog).toHaveBeenCalledOnce();
    expect(modelWeights).toHaveBeenCalledOnce();

    resolveCatalog('catalog');
    resolveWeights('weights');
    resolveArtist('artist');

    await expect(result).resolves.toEqual({
      artistName: 'artist',
      catalog: 'catalog',
      modelWeights: 'weights',
    });
  });
});

describe('merch design strategies', () => {
  it('keeps every strategy axis distinct rather than varying only adjectives', () => {
    const firstThree = MERCH_DESIGN_STRATEGIES.slice(0, 3);
    for (const field of [
      'composition',
      'typographyRole',
      'motifSystem',
      'palette',
      'density',
    ] as const) {
      expect(new Set(firstThree.map(strategy => strategy[field])).size).toBe(
        firstThree.length
      );
    }
  });

  it('builds pairwise-distinct source-grounded prompt contracts', () => {
    const prompts = MERCH_DESIGN_STRATEGIES.slice(0, 3).map(strategy =>
      buildMerchImagePrompt(
        'Tim White',
        'make something for the next release',
        strategy,
        source
      )
    );

    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('"Static Bloom"');
      expect(prompt).toContain('Provenance: Static Bloom');
      expect(prompt).toContain('Do not depict people, faces, portraits');
      expect(prompt).toContain('Do not recreate logos, trademarks, lyrics');
      expect(reviewMerchContent({ prompt }).verdict).toBe('pass');
    }
  });

  it('does not surface a recently selected strategy when fresh alternatives exist', () => {
    const strategies = selectMerchDesignStrategies(3, ['Signal Field']);
    expect(strategies).toHaveLength(3);
    expect(strategies.map(strategy => strategy.label)).not.toContain(
      'Signal Field'
    );
  });
});

describe('resolveGenerationNextStep', () => {
  it('never asks the artist to pick when no design rendered', async () => {
    const { resolveGenerationNextStep, MERCH_NO_DESIGNS_NEXT_STEP } =
      await import('./design-generation');
    expect(resolveGenerationNextStep(0, [{ verdict: 'accept' }])).toBe(
      MERCH_NO_DESIGNS_NEXT_STEP
    );
    expect(MERCH_NO_DESIGNS_NEXT_STEP).not.toMatch(/pick one and/i);
    expect(resolveGenerationNextStep(3, [])).toMatch(/^Pick one/);
  });
});

describe('generateMerchDesigns mockup enrichment', () => {
  it('enriches a hoodie option with the hoodie catalog product, not the default tee', async () => {
    // Pre-claim reads, in queue order: artist profile (sync .limit shift),
    // recent strategy labels (sync .limit shift), model weights (bare-await
    // microtask shift). Then batch insert, option insert, batch update.
    dbHarness.queue([{ displayName: 'Tim White', username: 'timwhite' }]);
    dbHarness.queue([]);
    dbHarness.queue([]);
    dbHarness.queue(undefined); // insert merchGenerationBatches
    dbHarness.queue(undefined); // insert merchDesignOptions (the ready option)
    dbHarness.queue(undefined); // update merchGenerationBatches -> ready

    const result = await generateMerchDesigns({
      profileId: '44444444-4444-4444-8444-444444444444',
      clerkUserId: 'clerk_test_user',
      prompt: 'stadium hoodie graphic',
      count: 1,
      source: {
        sourceType: 'song_title',
        sourceText: 'Static Bloom',
        provenanceTitle: 'Static Bloom',
        rightsStatus: 'owned',
      },
    });

    expect(result.success).toBe(true);
    expect(scheduleMerchMockupEnrichment).toHaveBeenCalledOnce();

    const [items] = vi.mocked(scheduleMerchMockupEnrichment).mock.calls[0];
    expect(items).toHaveLength(1);
    // The option's OWN resolved catalog must drive the mockup request so a
    // hoodie option gets hoodie mockups — not MERCH_DEFAULT_PRINTFUL_PRODUCT.
    expect(items[0].request).toMatchObject({
      catalogProductId: 216,
      catalogVariantIds: [9519],
      placements: ['front'],
      technique: 'embroidery',
      productTypes: ['hoodie'],
    });
  });
});
