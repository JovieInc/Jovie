'use server';

/**
 * Task server actions for dashboard/tasks surface.
 * Shell persistence (JOV-2201) relies on stable query keys + refetchOnMount:false
 * in chrome hooks so inner nav (tasks <-> releases) does not retrigger /api/version etc.
 */

import { and, asc, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { discogReleases } from '@/lib/db/schema/content';
import { tasks } from '@/lib/db/schema/tasks';
import { requireTasksWorkspaceAccess } from '@/lib/entitlements/tasks-gate';
import { isScreenCertAppShellFixtureProfile } from '@/lib/screen-cert/app-shell-fixture-gate';
import {
  bulkUpdateTasksInTransaction,
  createTaskInTransaction,
  deleteTaskInTransaction,
  moveTaskInTransaction,
  updateTaskInTransaction,
} from '@/lib/tasks/mutations.server';
import {
  clampLimit,
  getNextCursor,
  getPageRows,
  getTaskListWhereClause,
  mapAndDedupeTaskRows,
  readTask,
  readTaskList,
} from '@/lib/tasks/readers.server';
import { TASK_BOARD_STATUSES } from '@/lib/tasks/task-board';
import { mapTaskRow } from '@/lib/tasks/task-view';
import type {
  BulkTaskUpdateResult,
  CreateTaskInput,
  MoveTaskInput,
  MoveTaskResult,
  TaskBoardResult,
  TaskFilters,
  TaskListResult,
  TaskStats,
  TaskView,
  UpdateTaskInput,
} from '@/lib/tasks/types';
import { requireProfileId } from '../requireProfileId';
import {
  getScreenCertTaskById,
  getScreenCertTasksFixture,
} from './_lib/screen-cert-fixture';

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

export async function getTasks(filters?: TaskFilters): Promise<TaskListResult> {
  // Screen-cert fixture (tasks producer): resolve profileId first so the
  // reserved-fixture check can run before requireTasksWorkspaceAccess()'s
  // real entitlements/billing lookup, which has no noop-DB fallback of its
  // own. See screen-cert-fixture.ts and app-shell-fixture-gate.ts.
  const profileId = await requireProfileId();
  if (isScreenCertAppShellFixtureProfile(profileId)) {
    // The fixture ignores `filters`: TasksRoute's own prefetch only ever
    // calls this with DEFAULT_TASK_WORKSPACE_FILTERS (limit only, no
    // status/search/cursor), so a filtered result is never observed by
    // the producer this fixture serves.
    return getScreenCertTasksFixture();
  }
  await requireTasksWorkspaceAccess();
  return readTaskList(db, profileId, filters);
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
          mutationVersion: tasks.mutationVersion,
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
        tasks: mapAndDedupeTaskRows(getPageRows(rows, limit)),
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
  // Screen-cert fixture (tasks producer): see getTasks() above.
  const profileId = await requireProfileId();
  if (isScreenCertAppShellFixtureProfile(profileId)) {
    const fixtureTask = getScreenCertTaskById(taskId);
    if (!fixtureTask) {
      throw new Error('Task not found or access denied');
    }
    return fixtureTask;
  }
  await requireTasksWorkspaceAccess();

  const task = await readTask(db, profileId, taskId);
  if (!task) throw new Error('Task not found or access denied');
  return task;
}

export async function createTask(data: CreateTaskInput): Promise<TaskView> {
  const { actorId, profileId } = await requireTaskMutationScope();
  const created = await runAtomicDbOperation(
    tx => createTaskInTransaction(tx, profileId, data),
    { actorId, retry: 'serialization' }
  );
  return mapTaskRow(created);
}

async function requireTaskMutationScope() {
  await requireTasksWorkspaceAccess();
  const { userId } = await getCachedAuth({ session: 'fresh' });
  if (!userId) throw new Error('Authentication required');
  const profileId = await requireProfileId();
  return { actorId: userId, profileId };
}

export async function updateTask(
  taskId: string,
  data: UpdateTaskInput
): Promise<TaskView> {
  const { actorId, profileId } = await requireTaskMutationScope();
  const updated = await runAtomicDbOperation(
    tx => updateTaskInTransaction(tx, profileId, taskId, data),
    { actorId, retry: 'serialization' }
  );
  return mapTaskRow(updated);
}

export async function moveTask(input: MoveTaskInput): Promise<MoveTaskResult> {
  const { actorId, profileId } = await requireTaskMutationScope();
  return runAtomicDbOperation(
    tx => moveTaskInTransaction(tx, profileId, input),
    { actorId, retry: 'serialization' }
  );
}

export async function deleteTask(
  taskId: string,
  expectedMutationVersion?: number
): Promise<{ readonly success: true }> {
  const { actorId, profileId } = await requireTaskMutationScope();
  await runAtomicDbOperation(
    tx =>
      deleteTaskInTransaction(tx, profileId, taskId, expectedMutationVersion),
    { actorId, retry: 'serialization' }
  );
  return { success: true };
}

export async function bulkUpdateTasks(
  taskIds: string[],
  data: UpdateTaskInput,
  expectedMutationVersions?: Readonly<Record<string, number>>
): Promise<BulkTaskUpdateResult> {
  const { actorId, profileId } = await requireTaskMutationScope();
  if (taskIds.length === 0) return { success: true, affectedTasks: [] };
  const updated = await runAtomicDbOperation(
    tx =>
      bulkUpdateTasksInTransaction(
        tx,
        profileId,
        taskIds,
        data,
        expectedMutationVersions
      ),
    { actorId, retry: 'serialization' }
  );
  return { success: true, affectedTasks: updated.map(mapTaskRow) };
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
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        isNull(tasks.archivedAt)
      )
    )
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
        isNull(tasks.archivedAt),
        inArray(tasks.status, ['backlog', 'todo', 'in_progress']),
        gt(tasks.updatedAt, newerThan)
      )
    );

  return {
    ...stats,
    newActiveTodoCount: Number(newActive?.count ?? 0),
  };
}
