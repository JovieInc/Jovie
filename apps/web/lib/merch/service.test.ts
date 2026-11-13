import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CARD_ID,
  CATALOG_PRODUCT_ID,
  CLERK_USER_ID,
  dbHarness,
  GENERATION_ID,
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
} from './service.test-setup';

const { createMerchArtwork } = await import('./artwork');
const { resolveMerchCatalogSelection } = await import('./catalog');
const { createMerchGeneration, selectMerchDesign } = await import('./service');

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
