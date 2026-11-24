import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as confirmMerchAction } from '@/app/api/chat/confirm-merch-action/route';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createMerchGenerateTool } from '@/lib/chat/tools/merch-tools';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { discogReleases } from '@/lib/db/schema/content';
import { merchCards, merchDesignOptions } from '@/lib/db/schema/merch';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { createReleaseForProfile } from '@/lib/domain/releases';
import { reviewMerchContent } from '@/lib/merch/content-review';
import { MERCH_DEFAULT_PRINTFUL_PRODUCT } from '@/lib/merch/default-catalog';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for picking, pausing and removing merch in chat (JOV-14474),
 * registered in docs/product/outcome-coverage.json.
 *
 * It makes three designs through the real chat tool, then posts the merch
 * card's buttons to /api/chat/confirm-merch-action exactly as the chat does:
 * pick a design, pause it, remove it. Each step is read back from a real
 * database. Only paid or network boundaries are stubbed (image model, artwork
 * upload, Printful catalog, mockup enrichment) plus the signed-in user, so
 * the check costs nothing to run. Going live is left out on purpose: selling
 * concept-reviewed designs is still blocked pending a rights decision.
 */

const hoisted = vi.hoisted(() => ({
  userId: null as string | null,
  generatePrintGraphic: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: hoisted.userId }),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
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
vi.mock('@/lib/merch/catalog', async () => {
  const { MERCH_DEFAULT_PRINTFUL_PRODUCT: product } = await import(
    '@/lib/merch/default-catalog'
  );
  const { buildMerchPricingSnapshot: pricing } = await import(
    '@/lib/merch/pricing'
  );
  const selection = () => ({
    catalogProductId: product.catalogProductId,
    productName: product.productName,
    productType: product.productType,
    colorway: product.colorway,
    variantMap: product.variantMap,
    catalogVariantIds: Object.values(product.variantMap),
    sizes: product.sizes,
    placements: product.placements,
    technique: product.technique,
    availabilityRegion: 'US',
    shippingProfile: 'default',
    pricing: pricing({ printfulCostSource: 'printful' }),
    providerWarnings: [],
  });
  return {
    resolveMerchCatalogSelection: vi.fn(async () => selection()),
    resolveLiveMerchCatalogProduct: vi.fn(async () => selection()),
    listMerchCatalogProductOptions: vi.fn(async () => [selection()]),
  };
});

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  hoisted.userId = null;
  // Merch cards, batches and options cascade from the profile.
  if (createdProfileIds.length > 0) {
    await db
      .delete(chatAuditLog)
      .where(inArray(chatAuditLog.creatorProfileId, createdProfileIds));
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

async function createArtist(): Promise<{ userId: string; profileId: string }> {
  const suffix = randomUUID().slice(0, 12);
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration_merch_manage_${suffix}`,
      email: `integration-merch-manage-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `merch-manage-${suffix}`,
      'Merch Manage Artist'
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
  return { userId: user.id, profileId };
}

type CreateMerchExecute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  error?: string;
  generationId?: string;
}>;

/** Makes three designs the way "make merch" does, and returns the first. */
async function makeDesigns(userId: string, profileId: string) {
  hoisted.generatePrintGraphic.mockImplementation(async () => ({
    image: Buffer.from('fake-alpha-png-bytes'),
    modelKey: 'test-image-model',
    modelId: 'test-image-model-id',
    mediaType: 'image/png' as const,
    contentReview: reviewMerchContent({ prompt: 'Bold abstract graphic' }),
  }));
  // The chat route passes the app user id as clerkUserId.
  const tool = createMerchGenerateTool({
    profileId,
    clerkUserId: userId,
    conversationId: null,
    turnId: null,
  });
  const execute = tool.execute as unknown as CreateMerchExecute;
  const output = await execute({ prompt: 'make merch', makeLive: false });
  expect(output.success, output.error).toBe(true);
  const generationId = output.generationId as string;
  const [first] = await db
    .select({
      id: merchDesignOptions.id,
      optionNumber: merchDesignOptions.optionNumber,
    })
    .from(merchDesignOptions)
    .where(
      and(
        eq(merchDesignOptions.generationBatchId, generationId),
        eq(merchDesignOptions.optionNumber, 1)
      )
    );
  expect(first).toBeDefined();
  return { generationId, optionId: first.id };
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/chat/confirm-merch-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readCard(cardId: string) {
  const [card] = await db
    .select({
      status: merchCards.status,
      profileId: merchCards.creatorProfileId,
      selectedDesignOptionId: merchCards.selectedDesignOptionId,
    })
    .from(merchCards)
    .where(eq(merchCards.id, cardId));
  return card;
}

describe('pick, pause and remove merch in chat (outcome)', () => {
  it('a picked design becomes a merch card that pauses and removes', async () => {
    const { userId, profileId } = await createArtist();
    hoisted.userId = userId;
    const { generationId, optionId } = await makeDesigns(userId, profileId);

    const picked = await confirmMerchAction(
      post({
        profileId,
        generationId,
        optionId,
        optionNumber: 1,
        catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
        action: 'select',
      })
    );
    const pickedBody = (await picked.json()) as {
      success?: boolean;
      merchCardId?: string;
      error?: string;
    };
    expect(picked.status, pickedBody.error).toBe(200);
    expect(pickedBody.success).toBe(true);
    const cardId = pickedBody.merchCardId as string;
    expect(await readCard(cardId)).toEqual({
      status: 'draft',
      profileId,
      selectedDesignOptionId: optionId,
    });

    const paused = await confirmMerchAction(
      post({ profileId, merchCardId: cardId, action: 'pause' })
    );
    const pausedBody = (await paused.json()) as { error?: string };
    expect(paused.status, pausedBody.error).toBe(200);
    expect((await readCard(cardId))?.status).toBe('paused');

    const removed = await confirmMerchAction(
      post({ profileId, merchCardId: cardId, action: 'archive' })
    );
    const removedBody = (await removed.json()) as { error?: string };
    expect(removed.status, removedBody.error).toBe(200);
    expect((await readCard(cardId))?.status).toBe('archived');

    const audits = await db
      .select({ action: chatAuditLog.action })
      .from(chatAuditLog)
      .where(eq(chatAuditLog.creatorProfileId, profileId));
    expect(audits.map(audit => audit.action).sort()).toEqual([
      'archive_merch',
      'pause_merch',
      'select_merch',
    ]);
  });

  it('refuses to pick a design on someone else’s profile', async () => {
    const owner = await createArtist();
    const other = await createArtist();
    hoisted.userId = owner.userId;
    const { generationId, optionId } = await makeDesigns(
      owner.userId,
      owner.profileId
    );
    hoisted.userId = other.userId;

    const response = await confirmMerchAction(
      post({
        profileId: owner.profileId,
        generationId,
        optionId,
        optionNumber: 1,
        catalogProductId: MERCH_DEFAULT_PRINTFUL_PRODUCT.catalogProductId,
        action: 'select',
      })
    );

    expect(response.status).toBe(403);
    const cards = await db
      .select({ id: merchCards.id })
      .from(merchCards)
      .where(eq(merchCards.creatorProfileId, owner.profileId));
    expect(cards).toEqual([]);
  });
});
