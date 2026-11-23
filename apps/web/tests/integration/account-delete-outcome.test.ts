import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as deleteAccount } from '@/app/api/account/delete/route';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "delete my account" (JOV-14474), registered in
 * docs/product/outcome-coverage.json.
 *
 * It posts the settings page's request to /api/account/delete against a real
 * database, using the real session and transaction code, then reads the
 * account back: personal details erased, the account fenced, the profile gone,
 * and someone else's account untouched. Only the signed-in user, the rate
 * limiter, blob storage and cache invalidation are stubbed: there is no Next
 * request, Redis or blob store here.
 */

const hoisted = vi.hoisted(() => ({
  userId: null as string | null,
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: hoisted.userId }),
}));
vi.mock('@/lib/rate-limit', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkAccountDeleteRateLimit: vi.fn(async () => ({
    success: true,
    limit: 3,
    remaining: 2,
    reset: new Date(),
  })),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => undefined) }));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
  captureWarning: vi.fn(),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  hoisted.userId = null;
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
      clerkId: `integration_delete_${suffix}`,
      email: `integration-delete-${suffix}@example.com`,
      name: 'Delete Outcome Artist',
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `delete-${suffix}`,
      'Delete Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

function post(confirmation: string): Request {
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation }),
  });
}

async function readUser(userId: string) {
  const [row] = await db
    .select({
      email: users.email,
      name: users.name,
      userStatus: users.userStatus,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

async function profileCount(userId: string) {
  const rows = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId));
  return rows.length;
}

describe('delete the account (outcome)', () => {
  it('a confirmed delete erases the account and its profile, and leaves others alone', async () => {
    const artist = await createArtist();
    const bystander = await createArtist();
    hoisted.userId = artist.userId;

    const response = await deleteAccount(post('DELETE'));
    const body = (await response.json()) as { error?: string };
    expect(
      hoisted.captureError.mock.calls.map(call => String(call[1]))
    ).toEqual([]);
    expect(response.status, body.error).toBe(200);

    const erased = await readUser(artist.userId);
    expect(erased?.email).toBeNull();
    expect(erased?.name).toBeNull();
    expect(erased?.userStatus).toBe('banned');
    expect(erased?.deletedAt).toBeInstanceOf(Date);
    expect(await profileCount(artist.userId)).toBe(0);

    // A retry after a partial failure must be safe.
    const retry = await deleteAccount(post('DELETE'));
    expect(retry.status).toBe(200);

    const untouched = await readUser(bystander.userId);
    expect(untouched?.email).not.toBeNull();
    expect(untouched?.deletedAt).toBeNull();
    expect(await profileCount(bystander.userId)).toBe(1);
  });

  it('keeps the account when the confirmation is wrong or nobody is signed in', async () => {
    const artist = await createArtist();
    const before = await readUser(artist.userId);

    const signedOut = await deleteAccount(post('DELETE'));
    expect(signedOut.status).toBe(401);

    hoisted.userId = artist.userId;
    const unconfirmed = await deleteAccount(post('delete'));
    expect(unconfirmed.status).toBe(400);

    expect(await readUser(artist.userId)).toEqual(before);
    expect(await profileCount(artist.userId)).toBe(1);
  });
});
