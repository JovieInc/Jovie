import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as confirmEdit } from '@/app/api/chat/confirm-edit/route';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createProfileEditTool } from '@/lib/ai/tools/profile-edit';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "write my bio" and "change my name" in chat (JOV-14474),
 * registered in docs/product/outcome-coverage.json.
 *
 * The real proposeProfileEdit tool builds the preview, and the confirmation
 * card posts it to /api/chat/confirm-edit. This runs that path against a real
 * database and reads the profile back. Only the signed-in user, cache
 * invalidation and analytics are stubbed: there is no Next request here.
 */

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: session.userId }),
}));
vi.mock('@/lib/cache', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/cache')>()),
  invalidateHomepageCache: vi.fn(async () => undefined),
  invalidateProfileCache: vi.fn(async () => undefined),
  invalidateUsernameChange: vi.fn(async () => undefined),
}));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: vi.fn(),
}));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(async () => ({ ok: true })),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  session.userId = null;
  if (createdProfileIds.length > 0) {
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
      clerkId: `integration_edit_${suffix}`,
      email: `integration-edit-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `edit-${suffix}`,
      'Edit Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return { userId: user.id, profileId };
}

type ProposeExecute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  preview: { field: 'displayName' | 'bio'; newValue: string };
}>;

async function proposeAndConfirm(
  profileId: string,
  field: 'displayName' | 'bio',
  newValue: string
) {
  const tool = createProfileEditTool({
    displayName: 'Edit Outcome Artist',
    bio: null,
  });
  const execute = tool.execute as unknown as ProposeExecute;
  const proposal = await execute({ field, newValue });
  expect(proposal.success).toBe(true);

  return confirmEdit(
    new Request('http://localhost/api/chat/confirm-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profileId,
        field: proposal.preview.field,
        newValue: proposal.preview.newValue,
      }),
    })
  );
}

async function readProfile(profileId: string) {
  const [row] = await db
    .select({
      bio: creatorProfiles.bio,
      displayName: creatorProfiles.displayName,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));
  return row;
}

describe('edit the profile in chat (outcome)', () => {
  it('a confirmed chat bio and name are saved on the profile and audited', async () => {
    const { userId, profileId } = await createArtist();
    session.userId = userId;
    const bio = 'Producer and DJ from Los Angeles, making late-night house.';

    const bioResponse = await proposeAndConfirm(profileId, 'bio', bio);
    const bioBody = (await bioResponse.json()) as { error?: string };
    expect(bioResponse.status, bioBody.error).toBe(200);

    const nameResponse = await proposeAndConfirm(
      profileId,
      'displayName',
      'Nova Cascade'
    );
    const nameBody = (await nameResponse.json()) as { error?: string };
    expect(nameResponse.status, nameBody.error).toBe(200);

    expect(await readProfile(profileId)).toEqual({
      bio,
      displayName: 'Nova Cascade',
    });
    const audits = await db
      .select({ field: chatAuditLog.field })
      .from(chatAuditLog)
      .where(
        and(
          eq(chatAuditLog.creatorProfileId, profileId),
          eq(chatAuditLog.action, 'profile_edit')
        )
      );
    expect(audits.map(audit => audit.field).sort()).toEqual([
      'bio',
      'displayName',
    ]);
  });

  it('refuses to edit someone else’s profile', async () => {
    const owner = await createArtist();
    const other = await createArtist();
    session.userId = other.userId;
    const before = await readProfile(owner.profileId);

    const response = await proposeAndConfirm(
      owner.profileId,
      'bio',
      'Not my bio to write.'
    );

    expect(response.status).toBe(403);
    expect(await readProfile(owner.profileId)).toEqual(before);
  });
});
