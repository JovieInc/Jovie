'use server';

/**
 * Task server actions for dashboard/tasks surface.
 * Shell persistence (JOV-2201) relies on stable query keys + refetchOnMount:false
 * in chrome hooks so inner nav (tasks <-> releases) does not retrigger /api/version etc.
 */

import {
  and,
  asc,
  count,
  sql as drizzleSql,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  max,
  or,
  type SQL,
} from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import { requireTasksWorkspaceAccess } from '@/lib/entitlements/tasks-gate';
import { isTaskStatus, TASK_BOARD_STATUSES } from '@/lib/tasks/task-board';
import { buildTaskUpdateFieldPatch } from '@/lib/tasks/task-update';
import type {
  CreateTaskInput,
  MoveTaskInput,
  TaskBoardResult,
  TaskCursor,
  TaskFilters,
  TaskListResult,
  TaskStats,
  TaskStatus,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { requireProfileId } from '../requireProfileId';

const DEFAULT_TASK_LIMIT = 50;
const MAX_TASK_LIMIT = 100;
const TASK_POSITION_STEP = 1024;

function clampLimit(limit?: number): number {
  if (!limit) return DEFAULT_TASK_LIMIT;
  return Math.max(1, Math.min(limit, MAX_TASK_LIMIT));
}

function getTaskListWhereClause(profileId: string, filters?: TaskFilters) {
  const conditions: (SQL<unknown> | undefined)[] = [
    eq(tasks.creatorProfileId, profileId),
    isNull(tasks.deletedAt),
  ];

  if (filters?.status) {
    conditions.push(eq(tasks.status, filters.status));
  }

  if (filters?.priority) {
    conditions.push(eq(tasks.priority, filters.priority));
  }

  if (filters?.assigneeKind) {
    conditions.push(eq(tasks.assigneeKind, filters.assigneeKind));
  }

  if (filters?.releaseId === null) {
    conditions.push(isNull(tasks.releaseId));
  } else if (filters?.releaseId) {
    conditions.push(eq(tasks.releaseId, filters.releaseId));
  }

  const search = filters?.search?.trim();
  if (search) {
    conditions.push(ilike(tasks.title, `%${search}%`));
  }

  const cursor = filters?.cursor;
  if (cursor) {
    conditions.push(
      or(
        drizzleSql`${tasks.position} > ${cursor.position}`,
        and(
          eq(tasks.position, cursor.position),
          drizzleSql`${tasks.id} > ${cursor.id}`
        )
      )
    );
  }

  return and(...conditions);
}

function formatTaskStats(
  rows: Array<{ status: string; count: number }>
): TaskStats {
  let backlog = 0;
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  let cancelled = 0;

  for (const row of rows) {
    const value = Number(row.count);
    switch (row.status) {
      case 'backlog':
        backlog = value;
        break;
      case 'todo':
        todo = value;
        break;
      case 'in_progress':
        inProgress = value;
        break;
      case 'done':
        done = value;
        break;
      case 'cancelled':
        cancelled = value;
        break;
      default:
        break;
    }
  }

  return {
    backlog,
    todo,
    inProgress,
    done,
    cancelled,
    activeTodoCount: backlog + todo + inProgress,
    newActiveTodoCount: 0,
  };
}

function mapTaskRow(
  row: Omit<TaskView, 'releaseTitle'> & { releaseTitle?: string | null }
): TaskView {
  return {
    id: row.id,
    taskNumber: row.taskNumber,
    creatorProfileId: row.creatorProfileId,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    assigneeKind: row.assigneeKind,
    assigneeUserId: row.assigneeUserId ?? null,
    agentType: row.agentType ?? null,
    agentStatus: row.agentStatus,
    agentInput: row.agentInput ?? null,
    agentOutput: row.agentOutput ?? null,
    agentError: row.agentError ?? null,
    releaseId: row.releaseId ?? null,
    releaseTitle: row.releaseTitle ?? null,
    parentTaskId: row.parentTaskId ?? null,
    category: row.category ?? null,
    dueAt: row.dueAt ?? null,
    scheduledFor: row.scheduledFor ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    position: row.position,
    sourceTemplateId: row.sourceTemplateId ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertReleaseAccess(
  profileId: string,
  releaseId: string | null | undefined
): Promise<void> {
  if (!releaseId) {
    return;
  }

  const [release] = await db
    .select({ id: discogReleases.id })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .limit(1);

  if (!release) {
    throw new Error('Release not found or access denied');
  }
}

async function getNextTaskPosition(profileId: string): Promise<number> {
  const [row] = await db
    .select({ maxPosition: max(tasks.position) })
    .from(tasks)
    .where(and(eq(tasks.creatorProfileId, profileId), isNull(tasks.deletedAt)));

  return (row?.maxPosition ?? -1) + 1;
}

async function reserveTaskNumber(profileId: string): Promise<number> {
  const [row] = await db
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

async function createTaskForProfile(
  profileId: string,
  data: CreateTaskInput,
  attempt = 0
): Promise<TaskView> {
  await assertReleaseAccess(profileId, data.releaseId);

  const [taskNumber, position] = await Promise.all([
    reserveTaskNumber(profileId),
    getNextTaskPosition(profileId),
  ]);

  try {
    const [created] = await db
      .insert(tasks)
      .values({
        taskNumber,
        creatorProfileId: profileId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? 'todo',
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

    revalidatePath(APP_ROUTES.TASKS);
    revalidatePath(APP_ROUTES.RELEASES);
    revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);

    return mapTaskRow(created);
  } catch (error) {
    if (attempt === 0 && isUniqueViolation(error)) {
      return createTaskForProfile(profileId, data, 1);
    }

    throw error;
  }
}

async function getOwnedTaskOrThrow(
  profileId: string,
  taskId: string
): Promise<typeof tasks.$inferSelect> {
  const [task] = await db
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

  if (!task) {
    throw new Error('Task not found or access denied');
  }

  return task;
}

function getNextCursor(
  rows: Array<Pick<TaskView, 'id' | 'position'>>,
  limit: number
): TaskCursor | null {
  const hasNextPage = rows.length > limit;
  if (!hasNextPage) {
    return null;
  }

  const pageRows = rows.slice(0, limit);
  const nextCursorRow = pageRows.at(-1);
  return nextCursorRow
    ? {
        position: nextCursorRow.position,
        id: nextCursorRow.id,
      }
    : null;
}

function getPageRows<T>(rows: T[], limit: number): T[] {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

function assertMoveTaskInput(
  input: MoveTaskInput
): asserts input is MoveTaskInput {
  if (!input.taskId || typeof input.taskId !== 'string') {
    throw new Error('Task not found or access denied');
  }

  if (!isTaskStatus(input.toStatus)) {
    throw new Error('Invalid task status');
  }

  if (input.beforeTaskId && input.afterTaskId) {
    throw new Error('Provide only one task order anchor');
  }

  const adjacentIds = [input.beforeTaskId, input.afterTaskId].filter(Boolean);
  if (adjacentIds.includes(input.taskId)) {
    throw new Error('Task cannot be moved next to itself');
  }
}

function resolveInsertIndex(
  destinationRows: Array<typeof tasks.$inferSelect>,
  input: MoveTaskInput
): number {
  if (input.beforeTaskId) {
    const beforeIndex = destinationRows.findIndex(
      row => row.id === input.beforeTaskId
    );
    if (beforeIndex === -1) {
      throw new Error('Task order changed. Reload and try again.');
    }
    return beforeIndex;
  }

  if (input.afterTaskId) {
    const afterIndex = destinationRows.findIndex(
      row => row.id === input.afterTaskId
    );
    if (afterIndex === -1) {
      throw new Error('Task order changed. Reload and try again.');
    }
    return afterIndex + 1;
  }

  return destinationRows.length;
}

function getTaskMoveUpdates({
  rows,
  movingTask,
  input,
}: Readonly<{
  rows: Array<typeof tasks.$inferSelect>;
  movingTask: typeof tasks.$inferSelect;
  input: MoveTaskInput;
}>): Array<{
  readonly id: string;
  readonly status: TaskStatus;
  readonly position: number;
}> {
  const statuses = new Set<TaskStatus>([movingTask.status, input.toStatus]);
  const groups = new Map<TaskStatus, Array<typeof tasks.$inferSelect>>();

  for (const status of statuses) {
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

  const destinationRows = groups.get(input.toStatus) ?? [];
  const insertIndex = resolveInsertIndex(destinationRows, input);
  destinationRows.splice(insertIndex, 0, {
    ...movingTask,
    status: input.toStatus,
  });
  groups.set(input.toStatus, destinationRows);

  const updates: Array<{
    readonly id: string;
    readonly status: TaskStatus;
    readonly position: number;
  }> = [];

  for (const [status, groupRows] of groups) {
    groupRows.forEach((row, index) => {
      updates.push({
        id: row.id,
        status,
        position: (index + 1) * TASK_POSITION_STEP,
      });
    });
  }

  return updates;
}

export async function getTasks(filters?: TaskFilters): Promise<TaskListResult> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  const limit = clampLimit(filters?.limit);

  const rows = await db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      creatorProfileId: tasks.creatorProfileId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      assigneeKind: tasks.assigneeKind,
      assigneeUserId: tasks.assigneeUserId,
      agentType: tasks.agentType,
      agentStatus: tasks.agentStatus,
      agentInput: tasks.agentInput,
      agentOutput: tasks.agentOutput,
      agentError: tasks.agentError,
      releaseId: tasks.releaseId,
      releaseTitle: discogReleases.title,
      parentTaskId: tasks.parentTaskId,
      category: tasks.category,
      dueAt: tasks.dueAt,
      scheduledFor: tasks.scheduledFor,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      position: tasks.position,
      sourceTemplateId: tasks.sourceTemplateId,
      metadata: tasks.metadata,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(discogReleases, eq(tasks.releaseId, discogReleases.id))
    .where(getTaskListWhereClause(profileId, filters))
    .orderBy(asc(tasks.position), asc(tasks.id))
    .limit(limit + 1);

  const pageRows = getPageRows(rows, limit);

  return {
    tasks: pageRows.map(mapTaskRow),
    nextCursor: getNextCursor(rows, limit),
  };
}

export async function getTaskBoard(
  filters?: Omit<TaskFilters, 'status'>
): Promise<TaskBoardResult> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  const limit = clampLimit(filters?.limit);

  const columns = await Promise.all(
    TASK_BOARD_STATUSES.map(async status => {
      const boardFilters = {
        ...filters,
        status,
      } satisfies TaskFilters;

      const [totalRow] = await db
        .select({ totalCount: count() })
        .from(tasks)
        .where(getTaskListWhereClause(profileId, boardFilters));

      const rows = await db
        .select({
          id: tasks.id,
          taskNumber: tasks.taskNumber,
          creatorProfileId: tasks.creatorProfileId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          assigneeKind: tasks.assigneeKind,
          assigneeUserId: tasks.assigneeUserId,
          agentType: tasks.agentType,
          agentStatus: tasks.agentStatus,
          agentInput: tasks.agentInput,
          agentOutput: tasks.agentOutput,
          agentError: tasks.agentError,
          releaseId: tasks.releaseId,
          releaseTitle: discogReleases.title,
          parentTaskId: tasks.parentTaskId,
          category: tasks.category,
          dueAt: tasks.dueAt,
          scheduledFor: tasks.scheduledFor,
          startedAt: tasks.startedAt,
          completedAt: tasks.completedAt,
          position: tasks.position,
          sourceTemplateId: tasks.sourceTemplateId,
          metadata: tasks.metadata,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .leftJoin(discogReleases, eq(tasks.releaseId, discogReleases.id))
        .where(getTaskListWhereClause(profileId, boardFilters))
        .orderBy(asc(tasks.position), asc(tasks.id))
        .limit(limit + 1);

      return {
        status,
        tasks: getPageRows(rows, limit).map(mapTaskRow),
        totalCount: Number(totalRow?.totalCount ?? 0),
        nextCursor: getNextCursor(rows, limit),
      };
    })
  );

  return {
    columns,
    totalCount: columns.reduce((total, column) => total + column.totalCount, 0),
  };
}

export async function getTask(taskId: string): Promise<TaskView> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();

  const [row] = await db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      creatorProfileId: tasks.creatorProfileId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      assigneeKind: tasks.assigneeKind,
      assigneeUserId: tasks.assigneeUserId,
      agentType: tasks.agentType,
      agentStatus: tasks.agentStatus,
      agentInput: tasks.agentInput,
      agentOutput: tasks.agentOutput,
      agentError: tasks.agentError,
      releaseId: tasks.releaseId,
      releaseTitle: discogReleases.title,
      parentTaskId: tasks.parentTaskId,
      category: tasks.category,
      dueAt: tasks.dueAt,
      scheduledFor: tasks.scheduledFor,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      position: tasks.position,
      sourceTemplateId: tasks.sourceTemplateId,
      metadata: tasks.metadata,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(discogReleases, eq(tasks.releaseId, discogReleases.id))
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Task not found or access denied');
  }

  return mapTaskRow(row);
}

export async function createTask(data: CreateTaskInput): Promise<TaskView> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  return createTaskForProfile(profileId, data);
}

export async function updateTask(
  taskId: string,
  data: UpdateTaskInput
): Promise<TaskView> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  const existingTask = await getOwnedTaskOrThrow(profileId, taskId);

  await assertReleaseAccess(profileId, data.releaseId);

  const [updated] = await db
    .update(tasks)
    .set(buildTaskUpdateFieldPatch(data, existingTask))
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt)
      )
    )
    .returning();

  revalidatePath(APP_ROUTES.TASKS);
  revalidatePath(APP_ROUTES.RELEASES);
  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);

  return mapTaskRow(updated);
}

const MAX_MOVE_ATTEMPTS = 3;

async function attemptMoveTask(
  profileId: string,
  movingTask: typeof tasks.$inferSelect,
  input: MoveTaskInput
): Promise<boolean> {
  const adjacentIds = [input.beforeTaskId, input.afterTaskId].filter(
    (id): id is string => Boolean(id)
  );

  if (adjacentIds.length > 0) {
    const adjacentRows = await db
      .select({
        id: tasks.id,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.creatorProfileId, profileId),
          isNull(tasks.deletedAt),
          inArray(tasks.id, adjacentIds)
        )
      );

    if (
      adjacentRows.length !== adjacentIds.length ||
      adjacentRows.some(row => row.status !== input.toStatus)
    ) {
      // Adjacent anchor task moved or changed status — treat as a retry-able conflict.
      return false;
    }
  }

  const affectedStatuses = Array.from(
    new Set<TaskStatus>([movingTask.status, input.toStatus])
  );
  const affectedRows = await db
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

  let updates: ReturnType<typeof getTaskMoveUpdates>;
  try {
    updates = getTaskMoveUpdates({
      rows: affectedRows,
      movingTask,
      input,
    });
  } catch {
    // resolveInsertIndex throws when a before/after anchor is not found in the
    // destination column — the adjacent-status check above should have already
    // caught this, but guard here too so it triggers a retry rather than
    // surfacing the raw error to the user.
    return false;
  }

  if (updates.length === 0) {
    return true;
  }

  const originalUpdatedAtByTaskId = new Map(
    affectedRows.map(row => [row.id, row.updatedAt] as const)
  );

  // Build per-row preconditions with AND so we only update rows whose
  // timestamps still match what we read. Using OR here was the original bug:
  // OR matches any row with a correct timestamp, letting concurrent changes to
  // sibling rows slip through undetected.
  const updatePreconditions: SQL<unknown>[] = [];

  for (const update of updates) {
    const originalUpdatedAt = originalUpdatedAtByTaskId.get(update.id);
    if (!originalUpdatedAt) {
      // This row was in our computed updates but not in affectedRows — conflict.
      return false;
    }

    const precondition = and(
      eq(tasks.id, update.id),
      eq(tasks.updatedAt, originalUpdatedAt)
    );

    if (!precondition) {
      return false;
    }

    updatePreconditions.push(precondition);
  }

  // OR the per-row preconditions so the WHERE matches each row individually.
  // Combined with the inArray constraint below this bounds updates to exactly
  // our intended row IDs, and the returning-count check catches any row whose
  // updatedAt changed concurrently (triggering a retry).
  const guardedUpdateCondition =
    updatePreconditions.length === 1
      ? updatePreconditions[0]
      : or(...updatePreconditions);

  if (!guardedUpdateCondition) {
    return false;
  }

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
  const nextCompletedAt =
    input.toStatus === 'done'
      ? (movingTask.completedAt ?? new Date())
      : input.toStatus !== movingTask.status
        ? null
        : movingTask.completedAt;
  const completedAtCase = drizzleSql<Date | null>`case when ${tasks.id} = ${input.taskId} then ${nextCompletedAt} else ${tasks.completedAt} end`;

  const updated = await db
    .update(tasks)
    .set({
      status: statusCase,
      position: positionCase,
      completedAt: completedAtCase,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(
          tasks.id,
          updates.map(u => u.id)
        ),
        guardedUpdateCondition
      )
    )
    .returning({ id: tasks.id });

  // If the updated count differs, a concurrent change raced us. Signal retry.
  return updated.length === updates.length;
}

export async function moveTask(
  input: MoveTaskInput
): Promise<{ readonly success: true }> {
  await requireTasksWorkspaceAccess();
  assertMoveTaskInput(input);

  const profileId = await requireProfileId();

  for (let attempt = 0; attempt < MAX_MOVE_ATTEMPTS; attempt++) {
    // Re-read the moving task on each attempt so we have fresh timestamps.
    const movingTask = await getOwnedTaskOrThrow(profileId, input.taskId);
    const succeeded = await attemptMoveTask(profileId, movingTask, input);

    if (succeeded) {
      revalidatePath(APP_ROUTES.TASKS);
      revalidatePath(APP_ROUTES.RELEASES);
      revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
      return { success: true };
    }
  }

  // All retries exhausted — still succeed from the client's perspective.
  // The onSettled invalidateQueries in useMoveTaskMutation will re-sync state.
  revalidatePath(APP_ROUTES.TASKS);
  revalidatePath(APP_ROUTES.RELEASES);
  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  return { success: true };
}

export async function deleteTask(
  taskId: string
): Promise<{ readonly success: true }> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  await getOwnedTaskOrThrow(profileId, taskId);

  await db
    .update(tasks)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  revalidatePath(APP_ROUTES.TASKS);
  revalidatePath(APP_ROUTES.RELEASES);
  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);

  return { success: true };
}

export async function bulkUpdateTasks(
  taskIds: string[],
  data: UpdateTaskInput
): Promise<{ readonly success: true }> {
  await requireTasksWorkspaceAccess();
  if (taskIds.length === 0) {
    return { success: true };
  }

  const profileId = await requireProfileId();

  const ownedTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(tasks.id, taskIds)
      )
    );

  if (ownedTasks.length !== taskIds.length) {
    throw new Error('One or more tasks were not found or are not accessible');
  }

  for (const taskId of taskIds) {
    await updateTask(taskId, data);
  }

  return { success: true };
}

export async function getTaskStats(
  options: { readonly newerThan?: string | null } = {}
): Promise<TaskStats> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();

  const rows = await db
    .select({
      status: tasks.status,
      count: count(),
    })
    .from(tasks)
    .where(and(eq(tasks.creatorProfileId, profileId), isNull(tasks.deletedAt)))
    .groupBy(tasks.status);

  const stats = formatTaskStats(rows);
  const newerThan = options.newerThan ? new Date(options.newerThan) : null;
  if (!newerThan || Number.isNaN(newerThan.getTime())) {
    return stats;
  }

  const [newActive] = await db
    .select({ count: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(tasks.status, ['backlog', 'todo', 'in_progress']),
        gt(tasks.updatedAt, newerThan)
      )
    );

  return {
    ...stats,
    newActiveTodoCount: Number(newActive?.count ?? 0),
  };
}
