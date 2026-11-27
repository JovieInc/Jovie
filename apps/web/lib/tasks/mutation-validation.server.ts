import 'server-only';

import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import type { TransactionType } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import {
  releaseTaskPriorityEnum,
  taskAssigneeKindEnum,
} from '@/lib/db/schema/enums';
import { userProfileClaims } from '@/lib/db/schema/profiles';
import { type Task, tasks } from '@/lib/db/schema/tasks';
import {
  TaskMutationAccessError,
  TaskMutationConflictError,
  TaskMutationValidationError,
} from './errors';
import { isTaskStatus } from './task-board';
import type { CreateTaskInput, MoveTaskInput, UpdateTaskInput } from './types';

export function assertExpectedVersion(
  task: Task,
  expectedVersion?: number
): void {
  if (expectedVersion === undefined) return;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new TaskMutationValidationError('Invalid task mutation version');
  }
  if (task.mutationVersion !== expectedVersion) {
    throw new TaskMutationConflictError();
  }
}

export async function getOwnedTask(
  tx: TransactionType,
  profileId: string,
  taskId: string
): Promise<Task> {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt)
      )
    )
    .limit(1);
  if (!task) throw new TaskMutationAccessError();
  return task;
}

export async function assertReleaseAccess(
  tx: TransactionType,
  profileId: string,
  releaseId: string | null | undefined
): Promise<void> {
  if (!releaseId) return;
  const [release] = await tx
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .limit(1);
  if (!release)
    throw new TaskMutationAccessError('Release not found or access denied');
}

export async function assertParentAccess(
  tx: TransactionType,
  profileId: string,
  taskId: string | undefined,
  parentTaskId: string | null | undefined
): Promise<void> {
  let ancestorId = parentTaskId;
  const visited = new Set(taskId ? [taskId] : []);
  while (ancestorId) {
    if (visited.has(ancestorId)) {
      throw new TaskMutationValidationError(
        'A task cannot be its own ancestor'
      );
    }
    visited.add(ancestorId);
    const parent = await getOwnedTask(tx, profileId, ancestorId);
    ancestorId = parent.parentTaskId;
  }
}

export function validateTaskFields(
  data: CreateTaskInput | UpdateTaskInput
): void {
  if (
    data.title !== undefined &&
    (typeof data.title !== 'string' ||
      !data.title.trim() ||
      data.title.length > 200)
  ) {
    throw new TaskMutationValidationError(
      'Task title must be between 1 and 200 characters'
    );
  }
  if (data.status !== undefined && !isTaskStatus(data.status)) {
    throw new TaskMutationValidationError('Invalid task status');
  }
  if (
    data.priority !== undefined &&
    !releaseTaskPriorityEnum.enumValues.includes(data.priority)
  ) {
    throw new TaskMutationValidationError('Invalid task priority');
  }
  if (
    data.assigneeKind !== undefined &&
    !taskAssigneeKindEnum.enumValues.includes(data.assigneeKind)
  ) {
    throw new TaskMutationValidationError('Invalid task assignee');
  }
  for (const field of [
    'dueAt',
    'scheduledFor',
    'startedAt',
    'completedAt',
  ] as const) {
    const date = data[field];
    if (
      date != null &&
      (!(date instanceof Date) || Number.isNaN(date.getTime()))
    ) {
      throw new TaskMutationValidationError(`Invalid task date: ${field}`);
    }
  }
}

export async function assertAssigneeAccess(
  tx: TransactionType,
  profileId: string,
  assigneeUserId: string | null | undefined
): Promise<void> {
  if (assigneeUserId == null) return;
  const [claim] = await tx
    .select({ id: userProfileClaims.id })
    .from(userProfileClaims)
    .innerJoin(users, eq(users.id, userProfileClaims.userId))
    .where(
      and(
        eq(userProfileClaims.creatorProfileId, profileId),
        eq(drizzleSql`${userProfileClaims.userId}::text`, assigneeUserId),
        isNull(users.deletedAt),
        eq(users.userStatus, 'active')
      )
    )
    .limit(1);
  if (!claim)
    throw new TaskMutationAccessError(
      'Assignee does not have access to this profile'
    );
}

export function assertMoveInput(input: MoveTaskInput): void {
  if (!input?.taskId || typeof input.taskId !== 'string') {
    throw new TaskMutationAccessError();
  }
  if (!isTaskStatus(input.toStatus))
    throw new TaskMutationValidationError('Invalid task status');
  if (input.beforeTaskId && input.afterTaskId) {
    throw new TaskMutationValidationError('Provide only one task order anchor');
  }
  if ([input.beforeTaskId, input.afterTaskId].includes(input.taskId)) {
    throw new TaskMutationValidationError(
      'Task cannot be moved next to itself'
    );
  }
}
