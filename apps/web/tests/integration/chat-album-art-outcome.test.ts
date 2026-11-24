import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createReleaseTool } from '@/lib/ai/tools/create-release';
import { fetchReleaseCatalogForChat } from '@/lib/chat/releases';
import { createGenerateAlbumArtTool } from '@/lib/chat/tools/album-art';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { getReleaseForProfileById } from '@/lib/discography/queries';
import { applyGeneratedAlbumArt } from '@/lib/services/album-art/apply';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for chat's album art ask (chat-album-art, JOV-14474),
 * registered in docs/product/outcome-coverage.json. "Make cover art" must
 * give three candidates, and applying one must put it on the release the
 * release page reads. Only the image model and the blob store are stubbed:
 * release lookup, rendering, the manifest round trip, artwork processing and
 * the database write are real. Costs nothing to run.
 */

const { generateBackgroundsMock, blobStore } = vi.hoisted(() => ({
  generateBackgroundsMock: vi.fn(),
  blobStore: new Map<string, Buffer>(),
}));

const BLOB_HOST = 'https://outcome-test.public.blob.vercel-storage.com';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));
vi.mock('@/lib/services/album-art/provider-xai', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/services/album-art/provider-xai')
  >()),
  isAlbumArtGatewayConfigured: () => true,
  generateAlbumArtBackgrounds: generateBackgroundsMock,
}));
vi.mock('@/lib/rate-limit', async importOriginal => {
  const allow = { limit: async () => ({ success: true }) };
  return {
    ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
    albumArtGenerationLimiter: allow,
    albumArtGenerationBurstLimiter: allow,
  };
});
vi.mock('@/lib/blob-config', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/blob-config')>()),
  isBlobStorageConfigured: () => true,
  getBlobCommandOptions: () => ({}),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: Buffer) => {
    blobStore.set(path, Buffer.from(body));
    return { url: `${BLOB_HOST}/${path}` };
  }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...blobStore.keys()]
      .filter(path => path.startsWith(prefix))
      .map(path => ({ url: `${BLOB_HOST}/${path}`, pathname: path })),
  })),
  del: vi.fn(async () => undefined),
}));

setupDatabaseBeforeAll();

const realFetch = globalThis.fetch;
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

beforeEach(() => {
  // Serve the fake blob store; everything else (the database driver
  // included) goes to the real fetch.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith(`${BLOB_HOST}/`)) return realFetch(input, init);
    const body = blobStore.get(url.slice(BLOB_HOST.length + 1));
    return body
      ? new Response(new Uint8Array(body), { status: 200 })
      : new Response('not found', { status: 404 });
  });
});

afterEach(async () => {
  vi.mocked(globalThis.fetch).mockRestore();
  blobStore.clear();
  generateBackgroundsMock.mockReset();
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
});

async function createArtist(): Promise<{
  userId: string;
  clerkId: string;
  profileId: string;
}> {
  const suffix = randomUUID().slice(0, 12);
  const clerkId = `integration_albumart_${suffix}`;
  const [user] = await db
    .insert(users)
    .values({
      clerkId,
      email: `integration-albumart-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `albumart-${suffix}`,
      'Cover Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, clerkId, profileId };
}

type ToolExecute<T> = (input: Record<string, unknown>) => Promise<T>;

type AlbumArtResult = {
  success: boolean;
  state?: string;
  error?: string;
  generationId?: string;
  releaseId?: string | null;
  candidates?: { id: string; previewUrl: string; fullResUrl: string }[];
};

async function backgrounds() {
  const images = await Promise.all(
    ['#1d2733', '#2b1d33', '#1d332a'].map(background =>
      sharp({
        create: { width: 1024, height: 1024, channels: 3, background },
      })
        .png()
        .toBuffer()
    )
  );
  return { images, model: 'stub-image-model' };
}

async function albumArtTool(
  artist: { clerkId: string; profileId: string },
  canGenerateAlbumArt = true
) {
  const catalog = await fetchReleaseCatalogForChat(artist.profileId);
  return createGenerateAlbumArtTool({
    profileId: artist.profileId,
    clerkUserId: artist.clerkId,
    artistName: 'Cover Outcome Artist',
    canGenerateAlbumArt,
    releases: catalog.releases,
  }).execute as unknown as ToolExecute<AlbumArtResult>;
}

async function createRelease(
  artist: { userId: string; profileId: string },
  title: string
): Promise<string> {
  const create = createReleaseTool(artist.profileId, artist.userId)
    .execute as unknown as ToolExecute<{ success: boolean }>;
  expect((await create({ title, releaseType: 'single' })).success).toBe(true);
  const [row] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, artist.profileId));
  return row.id;
}

describe('chat album art (outcome)', () => {
  it('cover art made in chat gives three options and the pick lands on the release', async () => {
    generateBackgroundsMock.mockImplementation(backgrounds);
    const artist = await createArtist();
    const releaseId = await createRelease(artist, 'Night Bus');

    const generate = await albumArtTool(artist);
    const result = await generate({ releaseTitle: 'Night Bus' });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.state).toBe('generated');
    expect(result.releaseId).toBe(releaseId);
    expect(result.candidates).toHaveLength(3);
    expect(generateBackgroundsMock).toHaveBeenCalledTimes(1);
    for (const candidate of result.candidates ?? []) {
      expect(
        blobStore.has(candidate.fullResUrl.slice(BLOB_HOST.length + 1))
      ).toBe(true);
    }

    const picked = result.candidates?.[1];
    const applied = await applyGeneratedAlbumArt({
      clerkUserId: artist.clerkId,
      profileId: artist.profileId,
      releaseId,
      generationId: result.generationId as string,
      candidateId: picked?.id as string,
    });

    const release = await getReleaseForProfileById(
      artist.profileId,
      releaseId,
      { includeDrafts: true }
    );
    expect(release?.artworkUrl).toBe(applied.artworkUrl);
    expect(release?.artworkUrl).toMatch(
      new RegExp(`/artwork/releases/${releaseId}/1000\\.avif$`)
    );
    const [stored] = await db
      .select({ metadata: discogReleases.metadata })
      .from(discogReleases)
      .where(eq(discogReleases.id, releaseId));
    expect(
      (stored?.metadata as Record<string, unknown>)?.generatedArtwork
    ).toEqual(
      expect.objectContaining({
        generationId: result.generationId,
        candidateId: picked?.id,
      })
    );
  });

  it("another artist can't put generated art on the owner's release", async () => {
    generateBackgroundsMock.mockImplementation(backgrounds);
    const owner = await createArtist();
    const other = await createArtist();
    const releaseId = await createRelease(owner, 'Mine Only');

    const generate = await albumArtTool(other);
    const result = await generate({
      prompt: 'neon rain',
      createRelease: true,
      releaseTitle: 'Mine Only',
    });
    expect(result.success).toBe(true);
    expect(result.releaseId).toBeNull();

    await expect(
      applyGeneratedAlbumArt({
        clerkUserId: other.clerkId,
        profileId: owner.profileId,
        releaseId,
        generationId: result.generationId as string,
        candidateId: result.candidates?.[0]?.id as string,
      })
    ).rejects.toThrow();

    const [stored] = await db
      .select({ artworkUrl: discogReleases.artworkUrl })
      .from(discogReleases)
      .where(eq(discogReleases.id, releaseId));
    expect(stored?.artworkUrl ?? null).toBeNull();
  });

  it('a plan without album art makes nothing', async () => {
    const artist = await createArtist();
    await createRelease(artist, 'Free Tier');

    const generate = await albumArtTool(artist, false);
    const result = await generate({ releaseTitle: 'Free Tier' });
    expect(result.success).toBe(false);
    expect(generateBackgroundsMock).not.toHaveBeenCalled();
    expect(blobStore.size).toBe(0);
  });
});
