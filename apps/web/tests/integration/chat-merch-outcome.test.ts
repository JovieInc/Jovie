import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createMerchGenerateTool } from '@/lib/chat/tools/merch-tools';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import {
  merchDesignOptions,
  merchGenerationBatches,
} from '@/lib/db/schema/merch';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { createReleaseForProfile } from '@/lib/domain/releases';
import { reviewMerchContent } from '@/lib/merch/content-review';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from '@/lib/merch/default-catalog';
import { buildMerchPricingSnapshot } from '@/lib/merch/pricing';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "make merch" in chat (JOV-14474), registered in
 * docs/product/outcome-coverage.json.
 *
 * This is the exact ask that made nothing on staging on Nov 22: a fresh artist
 * with one release says "make merch" and no source. It runs the real chat
 * tool, the real source lookup and the real concept-review gate against a real
 * database, which has no stored review for a new artist. Only paid or network
 * boundaries are stubbed (image model, artwork upload, Printful catalog,
 * mockup enrichment), so the check costs nothing to run.
 */

const hoisted = vi.hoisted(() => ({
  generatePrintGraphic: vi.fn(),
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
  captureWarning: hoisted.captureWarning,
}));
vi.mock('@/lib/merch/graphic-engine', () => ({
  generatePrintGraphic: hoisted.generatePrintGraphic,
}));
vi.mock('@/lib/merch/mockup-engine', () => ({
  createGeneratedMerchArtwork: vi.fn(async () => ({
    printFileUrl: 'https://cdn.test/print-file.png',
    mockupUrl: 'https://cdn.test/mockup.png',
  })),
}));
vi.mock('@/lib/merch/mockup-enrichment', () => ({
  scheduleMerchMockupEnrichment: vi.fn(),
}));
vi.mock('@/lib/merch/catalog', () => ({
  resolveMerchCatalogSelection: vi.fn(async () => ({
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
  })),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  // Merch batches and options cascade from the profile.
  if (createdProfileIds.length > 0) {
    await db
      .delete(discogReleases)
      .where(inArray(discogReleases.creatorProfileId, createdProfileIds));
  }
  if (createdUserIds.length > 0) {
    await db
      .update(users)
      .set({ activeProfileId: null })
      .where(inArray(users.id, createdUserIds));
  }
  if (createdProfileIds.length > 0) {
    await db
      .delete(userProfileClaims)
      .where(inArray(userProfileClaims.creatorProfileId, createdProfileIds));
    await db
      .delete(creatorProfiles)
      .where(inArray(creatorProfiles.id, createdProfileIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdProfileIds.length = 0;
  createdUserIds.length = 0;
  vi.clearAllMocks();
});

async function createArtistWithRelease(): Promise<{
  userId: string;
  clerkId: string;
  profileId: string;
}> {
  const suffix = randomUUID().slice(0, 12);
  const clerkId = `integration_merch_${suffix}`;
  const [user] = await db
    .insert(users)
    .values({
      clerkId,
      email: `integration-merch-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `merch-${suffix}`,
      'Merch Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  const release = await createReleaseForProfile({
    userId: user.id,
    profileId,
    title: 'Static Bloom',
    releaseType: 'single',
  });
  expect(release.ok).toBe(true);
  return { userId: user.id, clerkId, profileId };
}

type CreateMerchExecute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  state?: string;
  error?: string;
  generationId?: string;
  designs?: ReadonlyArray<{
    status: string;
    preview_url?: string | null;
  }>;
}>;

describe('make merch in chat (outcome)', () => {
  it('a fresh artist asking "make merch" gets three designs saved, not a question', async () => {
    const { clerkId, profileId } = await createArtistWithRelease();
    hoisted.generatePrintGraphic.mockImplementation(async () => ({
      image: Buffer.from('fake-alpha-png-bytes'),
      modelKey: 'test-image-model',
      modelId: 'test-image-model-id',
      mediaType: 'image/png' as const,
      contentReview: reviewMerchContent({ prompt: 'Bold abstract graphic' }),
    }));
    const tool = createMerchGenerateTool({
      profileId,
      clerkUserId: clerkId,
      conversationId: null,
      turnId: null,
    });
    const execute = tool.execute as unknown as CreateMerchExecute;

    const output = await execute({ prompt: 'make merch', makeLive: false });

    // The Nov 22 failure: a review gate or source picker returned instead.
    expect(output.state).not.toBe('concept_review_required');
    expect(output.state).not.toBe('source_selection_required');
    expect(output.success).toBe(true);
    expect(output.designs).toHaveLength(3);
    expect(hoisted.generatePrintGraphic).toHaveBeenCalledTimes(3);
    expect(hoisted.captureError).not.toHaveBeenCalled();
    for (const design of output.designs ?? []) {
      expect(design.status).toBe('ready');
      expect(design.preview_url).toBe('https://cdn.test/mockup.png');
    }

    const generationId = output.generationId ?? '';
    expect(generationId).not.toBe('');
    const [batch] = await db
      .select({
        status: merchGenerationBatches.status,
        profileId: merchGenerationBatches.creatorProfileId,
      })
      .from(merchGenerationBatches)
      .where(eq(merchGenerationBatches.id, generationId));
    expect(batch?.profileId).toBe(profileId);
    expect(batch?.status).not.toBe('failed');

    const options = await db
      .select({ status: merchDesignOptions.status })
      .from(merchDesignOptions)
      .where(eq(merchDesignOptions.generationBatchId, generationId));
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.status).toBe('candidate');
    }
  });
});
