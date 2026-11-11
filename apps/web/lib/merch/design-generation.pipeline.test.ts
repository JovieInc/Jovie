import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeToolFailureOutput } from '@/lib/chat/tool-errors';
import {
  merchDesignOptions,
  merchGenerationBatches,
} from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
  MerchPersonContentRejectedError,
} from './content-contract';
import { reviewMerchContent } from './content-review';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from './default-catalog';
import { generateMerchDesigns } from './design-generation';
import { buildMerchPricingSnapshot } from './pricing';
import type { MerchSource } from './source-candidates';

/**
 * Production outcome contract for merch design generation (dispatch PR-1).
 *
 * Runs the REAL `generateMerchDesigns` pipeline with only the physical
 * boundaries mocked (db, image provider, artwork upload, mockup enrichment,
 * catalog, error capture) and asserts what production must be able to see:
 * a sanitized per-batch failure summary, persisted batch disposition, and
 * exactly-once production-visible capture when no design renders.
 */

const {
  dbMock,
  captureErrorMock,
  captureWarningMock,
  generatePrintGraphicMock,
  createGeneratedMerchArtworkMock,
  scheduleMerchMockupEnrichmentMock,
  resolveMerchCatalogSelectionMock,
} = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), update: vi.fn(), select: vi.fn() },
  captureErrorMock: vi.fn(),
  captureWarningMock: vi.fn(),
  generatePrintGraphicMock: vi.fn(),
  createGeneratedMerchArtworkMock: vi.fn(),
  scheduleMerchMockupEnrichmentMock: vi.fn(),
  resolveMerchCatalogSelectionMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
  captureWarning: captureWarningMock,
}));
vi.mock('./graphic-engine', () => ({
  generatePrintGraphic: generatePrintGraphicMock,
}));
vi.mock('./mockup-engine', () => ({
  createGeneratedMerchArtwork: createGeneratedMerchArtworkMock,
}));
vi.mock('./mockup-enrichment', () => ({
  scheduleMerchMockupEnrichment: scheduleMerchMockupEnrichmentMock,
}));
vi.mock('./catalog', () => ({
  resolveMerchCatalogSelection: resolveMerchCatalogSelectionMock,
}));

/**
 * Structural view of the additive `failureSummary` contract. Declared locally
 * (rather than imported) so the red-on-main run fails on assertions, not on
 * module resolution of types that do not exist yet on main.
 */
interface FailureSummaryLike {
  readonly requested: number;
  readonly ready: number;
  readonly byClass: Record<string, number>;
}

function failureSummaryOf(result: unknown): FailureSummaryLike | undefined {
  const value = (result as { failureSummary?: unknown }).failureSummary;
  return value && typeof value === 'object'
    ? (value as FailureSummaryLike)
    : undefined;
}

const PASS_PROMPT = 'Bold abstract wave graphic for the next release';

const source: MerchSource = {
  sourceType: 'song_title',
  sourceText: 'Static Bloom',
  provenanceTitle: 'Static Bloom',
  rightsStatus: 'owned',
};

function passReview() {
  return reviewMerchContent({ prompt: PASS_PROMPT });
}

function rejectReview() {
  return reviewMerchContent({ prompt: 'Portrait of the artist on stage' });
}

function printGraphic() {
  return {
    image: Buffer.from('fake-alpha-png-bytes'),
    modelKey: 'test-image-model',
    modelId: 'test-image-model-id',
    mediaType: 'image/png' as const,
    contentReview: passReview(),
  };
}

function catalogSelection() {
  return {
    catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
    productName: MERCH_DEFAULT_PRINTFUL_PRODUCT.productName,
    productType: MERCH_DEFAULT_PRINTFUL_PRODUCT.productType,
    colorway: MERCH_DEFAULT_PRINTFUL_PRODUCT.colorway,
    variantMap: MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap,
    catalogVariantIds: Object.values(MERCH_DEFAULT_PRINTFUL_PRODUCT.variantMap),
    sizes: MERCH_DEFAULT_PRINTFUL_PRODUCT.sizes,
    placements: MERCH_DEFAULT_PRINTFUL_PRODUCT.placements,
    technique: MERCH_DEFAULT_PRINTFUL_PRODUCT.technique,
    availabilityRegion: 'US',
    shippingProfile: 'default',
    pricing: buildMerchPricingSnapshot({ printfulCostSource: 'printful' }),
    providerWarnings: [],
  };
}

interface UpdatePatch {
  table: unknown;
  patch: Record<string, unknown>;
}

const updatePatches: UpdatePatch[] = [];

/** Drizzle-style awaitable query chain that resolves with `rows`. */
function awaitableChain(rows: readonly unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    'from',
    'innerJoin',
    'where',
    'orderBy',
    'groupBy',
    'limit',
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown
  ) => Promise.resolve(rows).then(onFulfilled, onRejected);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  updatePatches.length = 0;

  dbMock.select.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn((table: unknown) =>
      table === creatorProfiles
        ? awaitableChain([
            { displayName: 'Nova Cascade', username: 'novacascade' },
          ])
        : awaitableChain([])
    );
    return builder;
  });
  dbMock.insert.mockImplementation(() => ({
    values: vi.fn(() => Promise.resolve(undefined)),
  }));
  dbMock.update.mockImplementation((table: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn((patch: Record<string, unknown>) => {
      updatePatches.push({ table, patch });
      return chain;
    });
    chain.where = vi.fn(() => chain);
    chain.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(onFulfilled, onRejected);
    return chain;
  });

  resolveMerchCatalogSelectionMock.mockResolvedValue(catalogSelection());
  createGeneratedMerchArtworkMock.mockImplementation(async () => ({
    printFileUrl: 'https://cdn.test/print-file.png',
    mockupUrl: 'https://cdn.test/mockup.png',
  }));
  scheduleMerchMockupEnrichmentMock.mockImplementation(() => {});
});

function batchPatch(status: string): UpdatePatch | undefined {
  return updatePatches.find(
    patch =>
      patch.table === merchGenerationBatches && patch.patch.status === status
  );
}

describe('generateMerchDesigns production outcome contract', () => {
  it('classifies an all-provider-failure batch, marks the batch failed, and captures exactly one incident', async () => {
    generatePrintGraphicMock.mockRejectedValue(
      new Error('image provider request failed with status 503')
    );

    const result = await generateMerchDesigns({
      profileId: 'profile-1',
      clerkUserId: 'user-1',
      prompt: PASS_PROMPT,
      source,
      count: 3,
    });

    expect(result.success).toBe(true);
    expect(result.designs).toEqual([]);

    const summary = failureSummaryOf(result);
    expect(summary).toBeDefined();
    expect(summary?.requested).toBe(3);
    expect(summary?.ready).toBe(0);
    expect(summary?.byClass).toEqual({ image_provider: 3 });

    expect(batchPatch('failed')).toBeDefined();
    expect(batchPatch('ready')).toBeUndefined();

    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    const captureCall = captureErrorMock.mock.calls[0] as unknown as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(captureCall[2]).toEqual(
      expect.objectContaining({
        feature: 'merch',
        stage: 'generation',
        generationId: result.generationId,
      })
    );
    expect(failureSummaryOf(captureCall[2])).toMatchObject({
      requested: 3,
      ready: 0,
      byClass: { image_provider: 3 },
    });
    expect(captureWarningMock).not.toHaveBeenCalled();
  });

  it('captures a partial batch at warning level and keeps the batch ready with a usable preview', async () => {
    let call = 0;
    generatePrintGraphicMock.mockImplementation(async () => {
      call += 1;
      if (call === 1) return printGraphic();
      throw new Error('image provider request failed with status 503');
    });

    const result = await generateMerchDesigns({
      profileId: 'profile-1',
      clerkUserId: 'user-1',
      prompt: PASS_PROMPT,
      source,
      count: 3,
    });

    expect(result.designs).toHaveLength(1);
    expect(result.designs[0].preview_url).toBe('https://cdn.test/mockup.png');
    expect(result.designs[0].status).toBe('ready');

    const summary = failureSummaryOf(result);
    expect(summary).toBeDefined();
    expect(summary?.requested).toBe(3);
    expect(summary?.ready).toBe(1);
    expect(summary?.byClass).toEqual({ image_provider: 2 });

    expect(batchPatch('ready')).toBeDefined();
    expect(batchPatch('failed')).toBeUndefined();

    expect(scheduleMerchMockupEnrichmentMock).toHaveBeenCalledTimes(1);
    const enrichmentItems = scheduleMerchMockupEnrichmentMock.mock.calls[0][0];
    expect(enrichmentItems).toHaveLength(1);
    expect(enrichmentItems[0].optionId).toBe(result.designs[0].id);

    expect(captureWarningMock).toHaveBeenCalledTimes(1);
    const warningCall = captureWarningMock.mock.calls[0] as unknown as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(warningCall[2]).toEqual(
      expect.objectContaining({
        feature: 'merch',
        stage: 'generation',
        generationId: result.generationId,
      })
    );
    expect(failureSummaryOf(warningCall[2])).toMatchObject({
      requested: 3,
      ready: 1,
      byClass: { image_provider: 2 },
    });
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('treats an all-content-rejected batch as a person-content blocker, not a provider incident', async () => {
    generatePrintGraphicMock.mockRejectedValue(
      new MerchPersonContentRejectedError(rejectReview())
    );

    const result = await generateMerchDesigns({
      profileId: 'profile-1',
      clerkUserId: 'user-1',
      prompt: PASS_PROMPT,
      source,
      count: 3,
    });

    expect(result.success).toBe(true);
    expect(result.designs).toEqual([]);
    expect(result.nextStep).toBe(MERCH_PERSON_CONTENT_PUBLISH_BLOCKER);

    const summary = failureSummaryOf(result);
    expect(summary).toBeDefined();
    expect(summary?.requested).toBe(3);
    expect(summary?.ready).toBe(0);
    expect(summary?.byClass).toEqual({ content_reject: 3 });

    // Content rejection is an expected product gate, never a provider incident.
    expect(captureErrorMock).not.toHaveBeenCalled();
    expect(captureWarningMock).not.toHaveBeenCalled();

    // Rejected options are still persisted for evidence.
    const rejectedInsert = dbMock.insert.mock.calls.filter(
      callArgs => callArgs[0] === merchDesignOptions
    );
    expect(rejectedInsert).toHaveLength(3);
  });

  it('records a catalog pricing fallback at warning level with the reason class', async () => {
    resolveMerchCatalogSelectionMock.mockRejectedValue(
      new Error('Printful catalog service unavailable')
    );
    generatePrintGraphicMock.mockResolvedValue(printGraphic());

    const result = await generateMerchDesigns({
      profileId: 'profile-1',
      clerkUserId: 'user-1',
      prompt: PASS_PROMPT,
      source,
      count: 3,
    });

    // Fallback pricing keeps generation alive but draft-only (not sellable).
    expect(result.designs).toHaveLength(3);
    expect(result.designs[0].sellability?.sellable).toBe(false);

    const summary = failureSummaryOf(result);
    expect(summary).toBeDefined();
    expect(summary?.ready).toBe(3);
    expect(summary?.byClass).toEqual({});

    expect(captureWarningMock).toHaveBeenCalledTimes(1);
    const warningCall = captureWarningMock.mock.calls[0] as unknown as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(warningCall[2]).toEqual(
      expect.objectContaining({
        feature: 'merch',
        stage: 'catalog',
        reason: 'catalog_unavailable',
      })
    );
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it('preserves generationId and failureSummary when a merch failure payload is normalized', () => {
    const payload = normalizeToolFailureOutput('createMerch', {
      success: false,
      error: 'Profile ID required',
      generationId: 'gen-1',
      failureSummary: {
        requested: 3,
        ready: 0,
        byClass: { image_provider: 3 },
      },
    });

    expect(payload).not.toBeNull();
    expect((payload as { generationId?: string }).generationId).toBe('gen-1');
    expect(failureSummaryOf(payload)).toEqual({
      requested: 3,
      ready: 0,
      byClass: { image_provider: 3 },
    });
  });
});
