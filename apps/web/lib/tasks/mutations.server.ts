import 'server-only';

import {
  and,
  asc,
  sql as drizzleSql,
  eq,
  inArray,
  isNull,
  or,
} from 'drizzle-orm';
import type { TransactionType } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { type Task, tasks } from '@/lib/db/schema/tasks';
import {
  TaskMutationAccessError,
  TaskMutationConflictError,
  TaskMutationValidationError,
} from './errors';
import {
  assertAssigneeAccess,
  assertExpectedVersion,
  assertMoveInput,
  assertParentAccess,
  assertReleaseAccess,
  getOwnedTask,
  validateTaskFields,
} from './mutation-validation.server';
import { getNextTaskPosition, reserveTaskNumber } from './task-reservation';
import { buildTaskUpdateFieldPatch } from './task-update';
import { mapTaskRow } from './task-view';
import type {
  CreateTaskInput,
  MoveTaskInput,
  MoveTaskResult,
  TaskMutationSnapshot,
  TaskStatus,
  UpdateTaskInput,
} from './types';

const TASK_POSITION_STEP = 1024;

export {
  TaskMutationAccessError,
  TaskMutationConflictError,
  TaskMutationValidationError,
} from './errors';

/** Optional target ID is allocated by a trusted dispatcher, never a public actor argument. */
export async function createTaskInTransaction(
  tx: TransactionType,
  profileId: string,
  data: CreateTaskInput,
  preallocatedTaskId?: string
): Promise<Task> {
  validateTaskFields(data);
  if (data.title === undefined) {
    throw new TaskMutationValidationError('Task title is required');
  }
  await assertReleaseAccess(tx, profileId, data.releaseId);
  await assertParentAccess(
    tx,
    profileId,
    preallocatedTaskId,
    data.parentTaskId
  );
  await assertAssigneeAccess(tx, profileId, data.assigneeUserId);
  const taskNumber = await reserveTaskNumber(profileId, tx);
  const position = await getNextTaskPosition(profileId, tx);
  const [created] = await tx
    .insert(tasks)
    .values({
      ...(preallocatedTaskId ? { id: preallocatedTaskId } : {}),
      taskNumber,
      creatorProfileId: profileId,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority ?? 'medium',
      assigneeKind: data.assigneeKind ?? 'human',
      assigneeUserId: data.assigneeUserId ?? null,
      agentType: data.agentType ?? null,
      agentStatus: data.agentStatus ?? 'idle',
      agentInput: data.agentInput ?? {},
      agentOutput: data.agentOutput ?? {},
      agentError: data.agentError ?? null,
      releaseId: data.releaseId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      category: data.category ?? null,
      dueAt: data.dueAt ?? null,
      scheduledFor: data.scheduledFor ?? null,
      startedAt: data.startedAt ?? null,
      completedAt:
        data.completedAt ?? (data.status === 'done' ? new Date() : null),
      position,
      sourceTemplateId: data.sourceTemplateId ?? null,
      metadata: data.metadata ?? {},
    })
    .returning();
  if (!created)
    throw new TaskMutationConflictError('Task creation was not persisted');
  return created;
}

async function updateOwnedTask(
  tx: TransactionType,
  profileId: string,
  existingTask: Task,
  data: UpdateTaskInput
): Promise<Task> {
  // Even legacy callers without a client revision compare against the snapshot
  // used to derive rich-text metadata and completion fields.
  const expectedMutationVersion =
    data.expectedMutationVersion ?? existingTask.mutationVersion;
  assertExpectedVersion(existingTask, expectedMutationVersion);
  const [updated] = await tx
    .update(tasks)
    .set({
      ...buildTaskUpdateFieldPatch(data, existingTask),
      mutationVersion: drizzleSql`${tasks.mutationVersion} + 1`,
    })
    .where(
      and(
        eq(tasks.id, existingTask.id),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        eq(tasks.mutationVersion, expectedMutationVersion)
      )
    )
    .returning();
  if (!updated) throw new TaskMutationConflictError();
  return updated;
}

/** Database-only domain operations. Callers authorize before opening the tx. */
export async function updateTaskInTransaction(
  tx: TransactionType,
  profileId: string,
  taskId: string,
  data: UpdateTaskInput
): Promise<Task> {
  validateTaskFields(data);
  const task = await getOwnedTask(tx, profileId, taskId);
  assertExpectedVersion(task, data.expectedMutationVersion);
  await assertReleaseAccess(tx, profileId, data.releaseId);
  await assertParentAccess(tx, profileId, taskId, data.parentTaskId);
  await assertAssigneeAccess(tx, profileId, data.assigneeUserId);
  return updateOwnedTask(tx, profileId, task, data);
}

export async function deleteTaskInTransaction(
  tx: TransactionType,
  profileId: string,
  taskId: string,
  expectedMutationVersion?: number
): Promise<void> {
  const task = await getOwnedTask(tx, profileId, taskId);
  assertExpectedVersion(task, expectedMutationVersion);
  const now = new Date();
  const [deleted] = await tx
    .update(tasks)
    .set({
      deletedAt: now,
      updatedAt: now,
      mutationVersion: drizzleSql`${tasks.mutationVersion} + 1`,
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        eq(tasks.mutationVersion, task.mutationVersion)
      )
    )
    .returning({ id: tasks.id });
  if (!deleted) throw new TaskMutationConflictError();
}

export async function bulkUpdateTasksInTransaction(
  tx: TransactionType,
  profileId: string,
  taskIds: readonly string[],
  data: UpdateTaskInput,
  expectedMutationVersions: Readonly<Record<string, number>> = {}
): Promise<Task[]> {
  validateTaskFields(data);
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return [];
  const ownedTasks = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(tasks.id, ids)
      )
    )
    .orderBy(asc(tasks.id));
  if (ownedTasks.length !== ids.length) {
    throw new TaskMutationAccessError(
      'One or more tasks were not found or are not accessible'
    );
  }
  for (const task of ownedTasks) {
    assertExpectedVersion(
      task,
      expectedMutationVersions[task.id] ?? data.expectedMutationVersion
    );
  }
  await assertReleaseAccess(tx, profileId, data.releaseId);
  await assertAssigneeAccess(tx, profileId, data.assigneeUserId);
  const updated: Task[] = [];
  for (const task of ownedTasks) {
    await assertParentAccess(tx, profileId, task.id, data.parentTaskId);
    updated.push(
      await updateOwnedTask(tx, profileId, task, {
        ...data,
        expectedMutationVersion:
          expectedMutationVersions[task.id] ??
          data.expectedMutationVersion ??
          task.mutationVersion,
      })
    );
  }
  return updated;
}

async function taskSnapshots(
  tx: TransactionType,
  profileId: string,
  rows: readonly Task[]
): Promise<TaskMutationSnapshot[]> {
  const releaseIds = [...new Set(rows.flatMap(row => row.releaseId ?? []))];
  const releases = releaseIds.length
    ? await tx
        .select({ id: discogReleases.id, title: discogReleases.title })
        .from(discogReleases)
        .where(
          and(
            eq(discogReleases.creatorProfileId, profileId),
            inArray(discogReleases.id, releaseIds)
          )
        )
    : [];
  const titles = new Map(releases.map(release => [release.id, release.title]));
  return rows.map(row =>
    mapTaskRow({
      ...row,
      releaseTitle: titles.get(row.releaseId ?? '') ?? null,
    })
  );
}

function computeMoveUpdates(
  rows: readonly Task[],
  movingTask: Task,
  input: MoveTaskInput
) {
  const groups = new Map<TaskStatus, Task[]>();
  for (const status of new Set([movingTask.status, input.toStatus])) {
    groups.set(
      status,
      rows
        .filter(row => row.status === status && row.id !== movingTask.id)
        .sort(
          (left, right) =>
            left.position - right.position || left.id.localeCompare(right.id)
        )
    );
  }
  const destination = groups.get(input.toStatus) ?? [];
  let insertIndex = destination.length;
  const anchorId = input.beforeTaskId || input.afterTaskId;
  if (anchorId) {
    const anchorIndex = destination.findIndex(row => row.id === anchorId);
    if (anchorIndex < 0) {
      throw new TaskMutationConflictError(
        'Task order changed. Reload and try again.'
      );
    }
    insertIndex = anchorIndex + (input.afterTaskId ? 1 : 0);
  }
  destination.splice(insertIndex, 0, { ...movingTask, status: input.toStatus });
  groups.set(input.toStatus, destination);

  const updates: { id: string; status: TaskStatus; position: number }[] = [];
  for (const [status, group] of groups) {
    group.forEach((row, index) => {
      updates.push({
        id: row.id,
        status,
        position: (index + 1) * TASK_POSITION_STEP,
      });
    });
  }
  return updates;
}

export async function moveTaskInTransaction(
  tx: TransactionType,
  profileId: string,
  input: MoveTaskInput
): Promise<MoveTaskResult> {
  assertMoveInput(input);
  const movingTask = await getOwnedTask(tx, profileId, input.taskId);
  assertExpectedVersion(movingTask, input.expectedMutationVersion);
  const affectedStatuses = [...new Set([movingTask.status, input.toStatus])];
  const rows = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(tasks.status, affectedStatuses)
      )
    )
    .orderBy(asc(tasks.position), asc(tasks.id));
  const rowsById = new Map(rows.map(row => [row.id, row]));
  if (!rowsById.has(movingTask.id)) throw new TaskMutationConflictError();
  const completedAt =
    input.toStatus === 'done'
      ? (movingTask.completedAt ?? new Date())
      : input.toStatus !== movingTask.status
        ? null
        : movingTask.completedAt;
  const updates = computeMoveUpdates(rows, movingTask, input).filter(update => {
    const previous = rowsById.get(update.id);
    return (
      !previous ||
      previous.status !== update.status ||
      previous.position !== update.position ||
      (update.id === movingTask.id &&
        previous.completedAt?.getTime() !== completedAt?.getTime())
    );
  });
  if (updates.length === 0) {
    return {
      success: true,
      affectedTasks: await taskSnapshots(tx, profileId, [movingTask]),
    };
  }
  const rowGuards = updates.map(update => {
    const previous = rowsById.get(update.id);
    if (!previous) throw new TaskMutationConflictError();
    return and(
      eq(tasks.id, update.id),
      eq(tasks.mutationVersion, previous.mutationVersion)
    );
  });
  const statusCase = drizzleSql<typeof tasks.status>`case ${drizzleSql.join(
    updates.map(
      update =>
        drizzleSql`when ${tasks.id} = ${update.id} then ${update.status}::release_task_status`
    ),
    drizzleSql` `
  )} else ${tasks.status} end`;
  const positionCase = drizzleSql<number>`case ${drizzleSql.join(
    updates.map(
      update =>
        drizzleSql`when ${tasks.id} = ${update.id} then ${update.position}`
    ),
    drizzleSql` `
  )} else ${tasks.position} end`;
  const updated = await tx
    .update(tasks)
    .set({
      status: statusCase,
      position: positionCase,
      completedAt: drizzleSql`case when ${tasks.id} = ${input.taskId} then ${drizzleSql.param(completedAt, tasks.completedAt)} else ${tasks.completedAt} end`,
      updatedAt: new Date(),
      mutationVersion: drizzleSql`${tasks.mutationVersion} + 1`,
    })
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(
          tasks.id,
          updates.map(update => update.id)
        ),
        or(...rowGuards)
      )
    )
    .returning();
  // Throw inside the caller's atomic boundary: a partial guarded update must
  // never commit, retry later, or report success merely because the UI refetches.
  if (updated.length !== updates.length) throw new TaskMutationConflictError();
  if (!updated.some(task => task.id === movingTask.id)) {
    updated.push(movingTask);
  }
  return {
    success: true,
    affectedTasks: await taskSnapshots(tx, profileId, updated),
  };
}
