import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createReleaseTool } from '@/lib/ai/tools/create-release';
import { fetchReleaseCatalogForChat } from '@/lib/chat/releases';
import { createGenerateReleasePitchTool } from '@/lib/chat/tools/release-pitch';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { getReleaseForProfileById } from '@/lib/discography/queries';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for chat's release pitch ask (chat-pitch, JOV-14474),
 * registered in docs/product/outcome-coverage.json. "Pitch this to playlists"
 * must leave a saved pitch on the release that the release page reads back.
 * Only the model call is stubbed; release lookup, the voice and artist-rule
 * floors and the database write are real. Costs nothing to run.
 */

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));
vi.mock('@/lib/ai/sdk', () => ({
  gateway: vi.fn(() => 'stub-model'),
  generateObject: generateObjectMock,
}));

const PITCH_BODY =
  'Glass Weather is a slow-burning synth single about driving home after the last show. It sits next to late-night indie electronic playlists.';

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
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

async function createArtist(): Promise<{ userId: string; profileId: string }> {
  const suffix = randomUUID().slice(0, 12);
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration_pitch_${suffix}`,
      email: `integration-pitch-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `pitch-${suffix}`,
      'Pitch Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

type ToolExecute<T> = (input: Record<string, unknown>) => Promise<T>;

type PitchResult = {
  success: boolean;
  error?: string;
  target?: string;
  copyText?: string;
};

async function pitchTool(profileId: string, catalogProfileId = profileId) {
  const catalog = await fetchReleaseCatalogForChat(catalogProfileId);
  return createGenerateReleasePitchTool(
    profileId,
    { clerkUserId: 'integration_pitch_user', conversationId: null },
    catalog.releases,
    undefined,
    { status: catalog.status, total: catalog.total }
  ).execute as unknown as ToolExecute<PitchResult>;
}

describe('chat release pitch (outcome)', () => {
  it('a pitch made in chat is saved on the release the page reads', async () => {
    generateObjectMock.mockResolvedValue({
      object: { subjectLine: null, body: PITCH_BODY },
      usage: { inputTokens: 10, outputTokens: 40 },
    });
    const { userId, profileId } = await createArtist();
    const create = createReleaseTool(profileId, userId)
      .execute as unknown as ToolExecute<{ success: boolean }>;
    expect(
      (
        await create({
          title: 'Glass Weather',
          releaseType: 'single',
          releaseDate: '2099-03-01',
        })
      ).success
    ).toBe(true);

    const pitch = await pitchTool(profileId);
    const result = await pitch({
      releaseTitle: 'Glass Weather',
      target: 'playlist',
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.target).toBe('playlist');
    expect(result.copyText).toBe(PITCH_BODY);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);

    const [row] = await db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profileId));
    const release = await getReleaseForProfileById(profileId, row.id, {
      includeDrafts: true,
    });
    expect(release?.generatedPitches).toEqual(
      expect.objectContaining({ target: 'playlist', body: PITCH_BODY })
    );
  });

  it("does not save a pitch on another artist's release", async () => {
    generateObjectMock.mockResolvedValue({
      object: { subjectLine: null, body: PITCH_BODY },
      usage: { inputTokens: 10, outputTokens: 40 },
    });
    const owner = await createArtist();
    const other = await createArtist();
    const create = createReleaseTool(owner.profileId, owner.userId)
      .execute as unknown as ToolExecute<{ success: boolean }>;
    await create({ title: 'Not Yours', releaseType: 'single' });

    const pitch = await pitchTool(other.profileId, owner.profileId);
    const result = await pitch({ releaseTitle: 'Not Yours', target: 'radio' });
    expect(result.success).toBe(false);

    const [stored] = await db
      .select({ generatedPitches: discogReleases.generatedPitches })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, owner.profileId));
    expect(stored?.generatedPitches ?? null).toBeNull();
  });
});
