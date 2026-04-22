'use server';

import {
  and,
  asc,
  count,
  sql as drizzleSql,
  eq,
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
import type {
  CreateTaskInput,
  TaskCursor,
  TaskFilters,
  TaskListResult,
  TaskStats,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { requireProfileId } from '../requireProfileId';

const DEFAULT_TASK_LIMIT = 50;
const MAX_TASK_LIMIT = 100;

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

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const nextCursorRow = hasNextPage ? pageRows[pageRows.length - 1] : null;

  return {
    tasks: pageRows.map(mapTaskRow),
    nextCursor: nextCursorRow
      ? ({
          position: nextCursorRow.position,
          id: nextCursorRow.id,
        } satisfies TaskCursor)
      : null,
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

function resolveCompletedAt(
  data: UpdateTaskInput,
  existingTask: typeof tasks.$inferSelect,
  nextStatus: string
): Date | null | undefined {
  if (data.completedAt !== undefined) return data.completedAt;
  if (data.status === undefined) return existingTask.completedAt;
  return nextStatus === 'done'
    ? (existingTask.completedAt ?? new Date())
    : null;
}

function mergeTaskFields(
  data: UpdateTaskInput,
  existingTask: typeof tasks.$inferSelect,
  completedAt: Date | null | undefined,
  nextStatus: typeof tasks.$inferSelect.status
) {
  return {
    title: data.title ?? existingTask.title,
    description:
      data.description === undefined
        ? existingTask.description
        : data.description,
    status: nextStatus,
    priority: data.priority ?? existingTask.priority,
    assigneeKind: data.assigneeKind ?? existingTask.assigneeKind,
    assigneeUserId:
      data.assigneeUserId === undefined
        ? existingTask.assigneeUserId
        : data.assigneeUserId,
    agentType:
      data.agentType === undefined ? existingTask.agentType : data.agentType,
    agentStatus: data.agentStatus ?? existingTask.agentStatus,
    agentInput:
      data.agentInput === undefined ? existingTask.agentInput : data.agentInput,
    agentOutput:
      data.agentOutput === undefined
        ? existingTask.agentOutput
        : data.agentOutput,
    agentError:
      data.agentError === undefined ? existingTask.agentError : data.agentError,
    releaseId:
      data.releaseId === undefined ? existingTask.releaseId : data.releaseId,
    parentTaskId:
      data.parentTaskId === undefined
        ? existingTask.parentTaskId
        : data.parentTaskId,
    category:
      data.category === undefined ? existingTask.category : data.category,
    dueAt: data.dueAt === undefined ? existingTask.dueAt : data.dueAt,
    scheduledFor:
      data.scheduledFor === undefined
        ? existingTask.scheduledFor
        : data.scheduledFor,
    startedAt:
      data.startedAt === undefined ? existingTask.startedAt : data.startedAt,
    completedAt,
    position: data.position ?? existingTask.position,
    sourceTemplateId:
      data.sourceTemplateId === undefined
        ? existingTask.sourceTemplateId
        : data.sourceTemplateId,
    metadata:
      data.metadata === undefined ? existingTask.metadata : data.metadata,
    updatedAt: new Date(),
  };
}

export async function updateTask(
  taskId: string,
  data: UpdateTaskInput
): Promise<TaskView> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  const existingTask = await getOwnedTaskOrThrow(profileId, taskId);

  await assertReleaseAccess(profileId, data.releaseId);

  const nextStatus = data.status ?? existingTask.status;
  const completedAt = resolveCompletedAt(data, existingTask, nextStatus);

  const [updated] = await db
    .update(tasks)
    .set(mergeTaskFields(data, existingTask, completedAt, nextStatus))
    .where(eq(tasks.id, taskId))
    .returning();

  revalidatePath(APP_ROUTES.TASKS);
  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);

  return mapTaskRow(updated);
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

export async function getTaskStats(): Promise<TaskStats> {
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

  return formatTaskStats(rows);
}
