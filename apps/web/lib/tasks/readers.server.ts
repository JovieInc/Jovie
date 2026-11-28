import 'server-only';
import {
  and,
  asc,
  sql as drizzleSql,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { tasks } from '@/lib/db/schema/tasks';
import { dedupeReleaseTasks } from './dedupe-release-tasks';
import { mapTaskRow } from './task-view';
import type {
  TaskCursor,
  TaskFilters,
  TaskListResult,
  TaskView,
} from './types';

const DEFAULT_TASK_LIMIT = 50;
const MAX_TASK_LIMIT = 100;

export function clampLimit(limit?: number): number {
  if (!limit) return DEFAULT_TASK_LIMIT;
  return Math.max(1, Math.min(limit, MAX_TASK_LIMIT));
}

export function getTaskListWhereClause(
  profileId: string,
  filters?: TaskFilters
) {
  const conditions: (SQL<unknown> | undefined)[] = [
    eq(tasks.creatorProfileId, profileId),
    isNull(tasks.deletedAt),
    isNull(tasks.archivedAt),
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

export function mapAndDedupeTaskRows(
  rows: ReadonlyArray<
    Omit<TaskView, 'releaseTitle'> & { releaseTitle?: string | null }
  >
): TaskView[] {
  return dedupeReleaseTasks(rows.map(mapTaskRow));
}

// Every task read uses TanStack Query. Mutations return the authoritative
// records; their client hooks invalidate the affected queries without a route
// re-render or Router Cache purge.
export function getNextCursor(
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

export function getPageRows<T>(rows: T[], limit: number): T[] {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

const taskViewSelection = {
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
};

/** Caller proves profile access; both UI and Actions use this query/mapping. */
export async function readTaskList(
  connection: DbOrTransaction,
  profileId: string,
  filters?: TaskFilters
): Promise<TaskListResult> {
  const limit = clampLimit(filters?.limit);

  const rows = await connection
    .select(taskViewSelection)
    .from(tasks)
    .leftJoin(discogReleases, eq(tasks.releaseId, discogReleases.id))
    .where(getTaskListWhereClause(profileId, filters))
    .orderBy(asc(tasks.position), asc(tasks.id))
    .limit(limit + 1);

  const pageRows = getPageRows(rows, limit);

  return {
    tasks: mapAndDedupeTaskRows(pageRows),
    nextCursor: getNextCursor(rows, limit),
  };
}

/** Null permits a replay to report an entity that was subsequently deleted. */
export async function readTask(
  connection: DbOrTransaction,
  profileId: string,
  taskId: string
) {
  const [row] = await connection
    .select(taskViewSelection)
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

  return row ? mapTaskRow(row) : null;
}

export async function readTasksByIds(
  connection: DbOrTransaction,
  profileId: string,
  ids: readonly string[]
) {
  if (ids.length === 0) return [];
  const rows = await connection
    .select(taskViewSelection)
    .from(tasks)
    .leftJoin(discogReleases, eq(tasks.releaseId, discogReleases.id))
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        inArray(tasks.id, [...ids])
      )
    );
  return rows.map(mapTaskRow);
}
