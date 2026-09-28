/**
 * Shared task-number reservation and board-position helpers.
 * taskNumber is allocated atomically off creator_profiles.next_task_number;
 * position appends to the end of the profile's task list.
 */

import { and, sql as drizzleSql, eq, isNull, max } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';

export async function getNextTaskPosition(
  profileId: string,
  client: DbOrTransaction = db
): Promise<number> {
  const [row] = await client
    .select({ maxPosition: max(tasks.position) })
    .from(tasks)
    .where(and(eq(tasks.creatorProfileId, profileId), isNull(tasks.deletedAt)));

  return (row?.maxPosition ?? -1) + 1;
}

export async function reserveTaskNumber(
  profileId: string,
  client: DbOrTransaction = db
): Promise<number> {
  const [row] = await client
    .update(creatorProfiles)
    .set({
      nextTaskNumber: drizzleSql`${creatorProfiles.nextTaskNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId))
    .returning({
      taskNumber: drizzleSql<number>`${creatorProfiles.nextTaskNumber} - 1`,
    });

  if (!row) {
    throw new Error('Profile not found');
  }

  return row.taskNumber;
}
