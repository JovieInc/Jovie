'use server';

import { and, count, sql as drizzleSql, eq, isNull, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import {
  requireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess,
} from '@/lib/entitlements/tasks-gate';
import { captureError } from '@/lib/error-tracking';
import {
  DEFAULT_RELEASE_TASK_TEMPLATE,
  type DefaultTemplateItem,
} from '@/lib/release-tasks/default-template';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import type { TaskView } from '@/lib/tasks/types';
import { requireProfileId } from '../requireProfileId';
import { createTask, deleteTask, updateTask } from '../tasks/task-actions';

async function requireReleaseAccess(
  releaseId: string,
  profileId: string
): Promise<void> {
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

function readMetadataText(
  metadata: Record<string, unknown> | null,
  key: 'explainerText' | 'learnMoreUrl' | 'videoUrl'
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | null,
  key: 'dueDaysOffset'
): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : null;
}

function mapTaskToReleaseTaskView(task: TaskView): ReleaseTaskView {
  return {
    id: task.id,
    releaseId: task.releaseId ?? '',
    creatorProfileId: task.creatorProfileId,
    templateItemId: task.sourceTemplateId,
    title: task.title,
    description: task.description,
    explainerText: readMetadataText(task.metadata, 'explainerText'),
    learnMoreUrl: readMetadataText(task.metadata, 'learnMoreUrl'),
    videoUrl: readMetadataText(task.metadata, 'videoUrl'),
    category: task.category,
    status: task.status,
    priority: task.priority,
    position: task.position,
    assigneeType: task.assigneeKind === 'jovie' ? 'ai_workflow' : 'human',
    assigneeUserId: task.assigneeUserId,
    aiWorkflowId: task.agentType,
    dueDaysOffset: readMetadataNumber(task.metadata, 'dueDaysOffset'),
    dueDate: task.dueAt,
    completedAt: task.completedAt,
    metadata: task.metadata,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function computeDueDate(releaseDate: Date, offsetDays: number): Date {
  const date = new Date(releaseDate);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

export async function instantiateReleaseTasks(releaseId: string) {
  await requireReleasePlanGenerationAccess();
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  const [existing] = await db
    .select({ taskCount: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.releaseId, releaseId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt)
      )
    );

  if (existing && existing.taskCount > 0) {
    return getReleaseTasks(releaseId);
  }

  const [release, positionRow, counterRow] = await Promise.all([
    db
      .select({ releaseDate: discogReleases.releaseDate })
      .from(discogReleases)
      .where(eq(discogReleases.id, releaseId))
      .limit(1)
      .then(rows => rows[0]),
    db
      .select({ maxPosition: max(tasks.position) })
      .from(tasks)
      .where(
        and(eq(tasks.creatorProfileId, profileId), isNull(tasks.deletedAt))
      )
      .then(rows => rows[0]),
    db
      .update(creatorProfiles)
      .set({
        nextTaskNumber: drizzleSql`${creatorProfiles.nextTaskNumber} + ${DEFAULT_RELEASE_TASK_TEMPLATE.length}`,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId))
      .returning({ nextTaskNumber: creatorProfiles.nextTaskNumber })
      .then(rows => rows[0]),
  ]);

  const firstTaskNumber =
    (counterRow?.nextTaskNumber ?? DEFAULT_RELEASE_TASK_TEMPLATE.length + 1) -
    DEFAULT_RELEASE_TASK_TEMPLATE.length;
  const startPosition = (positionRow?.maxPosition ?? -1) + 1;
  const releaseDate = release?.releaseDate ?? null;

  const taskRows = DEFAULT_RELEASE_TASK_TEMPLATE.map(
    (item: DefaultTemplateItem, index: number) => ({
      taskNumber: firstTaskNumber + index,
      creatorProfileId: profileId,
      title: item.title,
      description: item.description ?? null,
      status: 'todo' as const,
      priority: item.priority,
      assigneeKind:
        item.assigneeType === 'ai_workflow'
          ? ('jovie' as const)
          : ('human' as const),
      agentType: item.aiWorkflowId ?? null,
      agentStatus: 'idle' as const,
      releaseId,
      category: item.category,
      dueAt:
        releaseDate === null
          ? null
          : computeDueDate(releaseDate, item.dueDaysOffset),
      position: startPosition + index,
      sourceTemplateId: null,
      metadata: {
        dueDaysOffset: item.dueDaysOffset,
        explainerText: item.explainerText ?? null,
        learnMoreUrl: item.learnMoreUrl ?? null,
        videoUrl: null,
        ...(item.descriptionHelper
          ? { descriptionHelper: item.descriptionHelper }
          : {}),
      },
    })
  );

  await db.insert(tasks).values(taskRows);

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  revalidatePath(APP_ROUTES.TASKS);

  return getReleaseTasks(releaseId);
}

export async function getReleaseTasks(
  releaseId: string
): Promise<ReleaseTaskView[]> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.releaseId, releaseId),
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt)
      )
    )
    .orderBy(tasks.position);

  return rows.map(row =>
    mapTaskToReleaseTaskView({
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
      releaseTitle: null,
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
    })
  );
}

function resolveAssigneeKind(
  assigneeType: 'human' | 'ai_workflow' | undefined
): 'jovie' | 'human' | undefined {
  if (assigneeType === undefined) return undefined;
  return assigneeType === 'ai_workflow' ? 'jovie' : 'human';
}

export async function updateReleaseTask(
  taskId: string,
  data: {
    readonly status?: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
    readonly priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    readonly assigneeType?: 'human' | 'ai_workflow';
    readonly title?: string;
    readonly description?: string | null;
    readonly dueDate?: Date | null;
  }
) {
  await requireTasksWorkspaceAccess();
  await updateTask(taskId, {
    status: data.status,
    priority: data.priority,
    assigneeKind: resolveAssigneeKind(data.assigneeType),
    title: data.title,
    description: data.description,
    dueAt: data.dueDate,
  });

  return { success: true };
}

export async function addReleaseTask(
  releaseId: string,
  data: {
    readonly title: string;
    readonly description?: string;
    readonly category?: string;
    readonly priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    readonly assigneeType?: 'human' | 'ai_workflow';
    readonly dueDate?: Date;
  }
): Promise<ReleaseTaskView> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  const task = await createTask({
    title: data.title,
    description: data.description ?? null,
    category: data.category ?? 'Custom',
    priority: data.priority ?? 'medium',
    assigneeKind: data.assigneeType === 'ai_workflow' ? 'jovie' : 'human',
    releaseId,
    dueAt: data.dueDate ?? null,
  });

  // Fire-and-forget cluster-classification telemetry. Must not surface
  // failures to the user; custom task telemetry is a roadmap signal, not a
  // critical path.
  void (async () => {
    try {
      const { classifyTaskCluster, CLASSIFIER_AUTO_CLUSTER_THRESHOLD } =
        await import('@/lib/release-tasks/classify-task-cluster');
      const { normalizeTaskText } = await import(
        '@/lib/release-tasks/normalize-task-text'
      );
      const { customTaskTelemetry, releaseSkillClusters } = await import(
        '@/lib/db/schema/release-tasks'
      );
      const clusters = await db
        .select({
          slug: releaseSkillClusters.slug,
          displayName: releaseSkillClusters.displayName,
        })
        .from(releaseSkillClusters);
      const userText = data.description
        ? `${data.title} | ${data.description}`
        : data.title;
      const result = await classifyTaskCluster(userText, clusters);
      const triageStatus =
        result.clusterSlug !== null &&
        result.confidence >= CLASSIFIER_AUTO_CLUSTER_THRESHOLD
          ? ('auto_clustered' as const)
          : ('pending_review' as const);
      await db.insert(customTaskTelemetry).values({
        releaseId,
        creatorProfileId: profileId,
        userText,
        normalizedText: normalizeTaskText(userText),
        suggestedClusterSlug: result.clusterSlug,
        classifierConfidence: result.confidence,
        triageStatus,
      });
    } catch (error) {
      captureError('Failed to record custom task telemetry', error, {
        context: 'release-task-classification-telemetry',
        releaseId,
        profileId,
        taskId: task.id,
      });
    }
  })();

  return mapTaskToReleaseTaskView(task);
}

export async function deleteReleaseTask(taskId: string) {
  await requireTasksWorkspaceAccess();
  await deleteTask(taskId);
  return { success: true };
}

export async function getReleaseTaskSummary(
  _profileId?: string
): Promise<Map<string, { total: number; done: number }>> {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();

  const rows = await db
    .select({
      releaseId: tasks.releaseId,
      total: count(),
      done: drizzleSql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'done')`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profileId),
        isNull(tasks.deletedAt),
        drizzleSql`${tasks.releaseId} IS NOT NULL`
      )
    )
    .groupBy(tasks.releaseId);

  return new Map(
    rows.flatMap(row =>
      row.releaseId === null
        ? []
        : [
            [
              row.releaseId,
              {
                total: Number(row.total),
                done: Number(row.done),
              },
            ] as const,
          ]
    )
  );
}

export async function recomputeTaskDueDates(
  releaseId: string,
  newReleaseDate: Date
) {
  await requireTasksWorkspaceAccess();
  await db.execute(drizzleSql`
    UPDATE tasks
    SET due_at = ${newReleaseDate}::timestamp + (((metadata ->> 'dueDaysOffset')::int) || ' days')::interval,
        updated_at = NOW()
    WHERE release_id = ${releaseId}
      AND deleted_at IS NULL
      AND metadata ->> 'dueDaysOffset' IS NOT NULL
  `);

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  revalidatePath(APP_ROUTES.TASKS);
}
