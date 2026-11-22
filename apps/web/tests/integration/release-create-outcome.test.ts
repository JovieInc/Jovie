import { eq, inArray } from 'drizzle-orm';
/* eslint-disable no-restricted-imports -- Integration test requires full schema access */
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createReleaseTool } from '@/lib/ai/tools/create-release';
import type * as schema from '@/lib/db/schema';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { getReleaseBySlug } from '@/lib/discography/queries';
import { createReleaseForProfile } from '@/lib/domain/releases';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "create a release" (JOV-14474), registered in
 * docs/product/outcome-coverage.json. It runs the real write, from the chat
 * tool and from the Releases form's domain function, against a real database
 * and reads the release back through the smart link's lookup. Only the cache
 * invalidation is stubbed: there is no Next request or edge cache here.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));

type TestDb = NeonDatabase<typeof schema>;

setupDatabaseBeforeAll();

let db: TestDb;
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

beforeAll(() => {
  const connection = (globalThis as typeof globalThis & { db?: TestDb }).db;
  if (!connection) {
    throw new Error(
      'Database connection not initialized for release outcome integration tests'
    );
  }
  db = connection;
});

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
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration_release_${suffix}`,
      email: `integration-release-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `release-${suffix}`,
      'Release Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

type CreateReleaseExecute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  error?: string;
  release?: { id: string; slug: string; title: string };
}>;

describe('create a release (outcome)', () => {
  it('chat createRelease stores a release that its smart link resolves', async () => {
    const { userId, profileId } = await createArtist();
    const tool = createReleaseTool(profileId, userId);
    const execute = tool.execute as unknown as CreateReleaseExecute;

    const output = await execute({
      title: 'Save the Night',
      releaseType: 'single',
      releaseDate: '2099-01-15',
    });

    expect(output.success).toBe(true);
    const slug = output.release?.slug ?? '';
    expect(slug).not.toBe('');
    const stored = await getReleaseBySlug(profileId, slug);
    expect(stored).toEqual(
      expect.objectContaining({
        id: output.release?.id,
        title: 'Save the Night',
        releaseType: 'single',
        status: 'scheduled',
        sourceType: 'manual',
      })
    );
  });

  it('the Releases form path writes the same way, and a repeated title gets its own smart link', async () => {
    const { userId, profileId } = await createArtist();
    const first = await createReleaseForProfile({
      userId,
      profileId,
      title: 'All This Noise',
      releaseType: 'ep',
    });
    const second = await createReleaseForProfile({
      userId,
      profileId,
      title: 'All This Noise',
      releaseType: 'ep',
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.release.slug).not.toBe(first.release.slug);
    const rows = await db
      .select({ slug: discogReleases.slug, status: discogReleases.status })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profileId));
    expect(rows.map(row => row.slug).sort()).toEqual(
      [first.release.slug, second.release.slug].sort()
    );
    expect(rows.every(row => row.status === 'draft')).toBe(true);
    expect(
      await getReleaseBySlug(profileId, second.release.slug)
    ).not.toBeNull();
  });
});
