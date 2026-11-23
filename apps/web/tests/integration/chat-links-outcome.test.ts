import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as confirmLink } from '@/app/api/chat/confirm-link/route';
import { POST as confirmRemoveLink } from '@/app/api/chat/confirm-remove-link/route';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "add a link" and "remove a link" in chat (JOV-14474),
 * registered in docs/product/outcome-coverage.json.
 *
 * The chat tool proposes a link with `detectPlatform`, and the confirmation
 * card posts that result to /api/chat/confirm-link. This runs that exact path
 * against a real database, then the removal card's /api/chat/confirm-remove-link,
 * and reads the profile's links back. Only the signed-in user and the cache
 * invalidation are stubbed: there is no Next request or edge cache here.
 */

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: session.userId }),
}));
vi.mock('@/lib/cache', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/cache')>()),
  invalidateSocialLinksCache: vi.fn(async () => undefined),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  session.userId = null;
  if (createdProfileIds.length > 0) {
    await db
      .delete(socialLinks)
      .where(inArray(socialLinks.creatorProfileId, createdProfileIds));
    await db
      .delete(chatAuditLog)
      .where(inArray(chatAuditLog.creatorProfileId, createdProfileIds));
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
      clerkId: `integration_links_${suffix}`,
      email: `integration-links-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `links-${suffix}`,
      'Links Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function activeLinks(profileId: string) {
  return db
    .select({ id: socialLinks.id, url: socialLinks.url })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.state, 'active')
      )
    );
}

describe('add and remove a link in chat (outcome)', () => {
  it('a confirmed chat link is saved on the profile, and a confirmed removal takes it off', async () => {
    const { userId, profileId } = await createArtist();
    session.userId = userId;

    // What the proposeSocialLink tool returns for "add my instagram".
    const detected = detectPlatform('instagram.com/linksoutcome');
    expect(detected.isValid).toBe(true);

    const added = await confirmLink(
      post({
        profileId,
        platform: detected.platform.id,
        url: detected.originalUrl,
        normalizedUrl: detected.normalizedUrl,
        requestId: `links-outcome-${randomUUID()}`,
      })
    );
    const addedBody = (await added.json()) as {
      success?: boolean;
      linkId?: string;
      error?: string;
    };
    expect(added.status, addedBody.error).toBe(200);
    expect(addedBody.success).toBe(true);

    const afterAdd = await activeLinks(profileId);
    expect(afterAdd).toEqual([
      { id: addedBody.linkId, url: detected.normalizedUrl },
    ]);

    const removed = await confirmRemoveLink(
      post({ profileId, linkId: addedBody.linkId })
    );
    const removedBody = (await removed.json()) as { error?: string };
    expect(removed.status, removedBody.error).toBe(200);
    expect(await activeLinks(profileId)).toEqual([]);
  });

  it('refuses to save a link on someone else’s profile', async () => {
    const owner = await createArtist();
    const other = await createArtist();
    session.userId = other.userId;
    const detected = detectPlatform('instagram.com/notyours');

    const response = await confirmLink(
      post({
        profileId: owner.profileId,
        platform: detected.platform.id,
        url: detected.originalUrl,
        normalizedUrl: detected.normalizedUrl,
      })
    );

    expect(response.status).toBe(403);
    expect(await activeLinks(owner.profileId)).toEqual([]);
  });
});
