import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createReleaseTool } from '@/lib/ai/tools/create-release';
import { fetchReleaseCatalogForChat } from '@/lib/chat/releases';
import {
  createCheckCanvasStatusTool,
  createMarkCanvasUploadedTool,
} from '@/lib/chat/tools/canvas-status';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for chat's Spotify Canvas asks (chat-creative, JOV-14474),
 * registered in docs/product/outcome-coverage.json. "I uploaded a canvas for X"
 * must change what chat reports next: the release is created through chat,
 * marked through the markCanvasUploaded tool, then read back through the same
 * catalog read and status tool a new turn uses. No model or generation runs.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));

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
      clerkId: `integration_canvas_${suffix}`,
      email: `integration-canvas-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `canvas-${suffix}`,
      'Canvas Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

type ToolExecute<T> = (input: Record<string, unknown>) => Promise<T>;

describe('chat canvas status (outcome)', () => {
  it('marking a canvas uploaded is what the next turn reports', async () => {
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

    const before = await fetchReleaseCatalogForChat(profileId);
    expect(before.status).toBe('ok');
    expect(before.releases.map(release => release.canvasStatus)).toEqual([
      'not_set',
    ]);

    const mark = createMarkCanvasUploadedTool(profileId, before.releases)
      .execute as unknown as ToolExecute<{
      success: boolean;
      error?: string;
      release?: { newStatus: string };
    }>;
    const marked = await mark({ releaseTitle: 'Glass Weather' });
    expect(marked.error).toBeUndefined();
    expect(marked.success).toBe(true);

    const [stored] = await db
      .select({ metadata: discogReleases.metadata })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profileId));
    expect(stored?.metadata).toEqual(
      expect.objectContaining({ canvasStatus: 'uploaded' })
    );

    const after = await fetchReleaseCatalogForChat(profileId);
    const status = createCheckCanvasStatusTool(profileId, after.releases, {
      status: after.status,
      total: after.total,
    }).execute as unknown as ToolExecute<{
      success: boolean;
      summary: { total: number; withCanvas: number; withoutCanvas: number };
    }>;
    const report = await status({ includeAll: true });
    expect(report.success).toBe(true);
    expect(report.summary).toEqual({
      total: 1,
      withCanvas: 1,
      withoutCanvas: 0,
    });
  });

  it("does not mark another artist's release", async () => {
    const owner = await createArtist();
    const other = await createArtist();
    const create = createReleaseTool(owner.profileId, owner.userId)
      .execute as unknown as ToolExecute<{ success: boolean }>;
    await create({ title: 'Not Yours', releaseType: 'single' });
    const ownerCatalog = await fetchReleaseCatalogForChat(owner.profileId);

    const mark = createMarkCanvasUploadedTool(
      other.profileId,
      ownerCatalog.releases
    ).execute as unknown as ToolExecute<{ success: boolean }>;
    const result = await mark({ releaseTitle: 'Not Yours' });
    expect(result.success).toBe(false);

    const [stored] = await db
      .select({ metadata: discogReleases.metadata })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, owner.profileId));
    expect(stored?.metadata?.canvasStatus).toBeUndefined();
  });
});
