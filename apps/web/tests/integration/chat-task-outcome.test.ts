import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProfileForExistingUser } from '@/app/onboarding/actions/profile-setup';
import { createManageTasksTool } from '@/lib/chat/tools/tasks';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for "create a task" in chat (JOV-14474), registered in
 * docs/product/outcome-coverage.json. The chat manageTasks tool writes a real
 * task row; only the signed-in session (which profile is selected, and the
 * workspace gate) is stubbed, because there is no Next request here.
 */

const session = vi.hoisted(() => ({ profileId: '' }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireTasksWorkspaceAccess: vi.fn(async () => undefined),
}));
vi.mock('@/app/app/(shell)/dashboard/requireProfileId', () => ({
  requireProfileId: vi.fn(async () => session.profileId),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];

afterEach(async () => {
  if (createdProfileIds.length > 0) {
    await db
      .delete(tasks)
      .where(inArray(tasks.creatorProfileId, createdProfileIds));
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

async function createArtist(): Promise<string> {
  const suffix = randomUUID().slice(0, 12);
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration_task_${suffix}`,
      email: `integration-task-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  const result = await db.transaction(tx =>
    createProfileForExistingUser(
      tx,
      user.id,
      `task-${suffix}`,
      'Task Outcome Artist'
    )
  );
  expect(result.status).toBe('created');
  const profileId = result.profileId as string;
  createdProfileIds.push(profileId);
  return profileId;
}

type ManageTasksExecute = (input: Record<string, unknown>) => Promise<{
  success: boolean;
  intent?: string;
  task?: { id: string; title: string };
}>;

describe('chat: create a task (outcome)', () => {
  it('chat manageTasks create writes a task row for the artist', async () => {
    const profileId = await createArtist();
    session.profileId = profileId;
    const execute = createManageTasksTool(profileId)
      .execute as unknown as ManageTasksExecute;

    const output = await execute({
      intent: 'create',
      title: 'Send stems to the mix engineer',
    });

    expect(output).toEqual(
      expect.objectContaining({ success: true, intent: 'create' })
    );
    const rows = await db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.creatorProfileId, profileId),
          eq(tasks.title, 'Send stems to the mix engineer')
        )
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ id: output.task?.id, status: 'todo' })
    );
  });
});
