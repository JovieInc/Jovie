'use server';

import { and, count, sql as drizzleSql, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { releaseTasks } from '@/lib/db/schema/release-tasks';
import {
  DEFAULT_RELEASE_TASK_TEMPLATE,
  type DefaultTemplateItem,
} from '@/lib/release-tasks/default-template';
import { getDashboardData } from '../actions';

// ─── Auth Helper ────────────────────────────────────────────────────

async function requireProfileId(): Promise<string> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    redirect('/onboarding');
  }

  return data.selectedProfile.id;
}

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

// ─── Instantiate Release Tasks ──────────────────────────────────────

export async function instantiateReleaseTasks(releaseId: string) {
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  // Idempotent: check if tasks already exist
  const [existing] = await db
    .select({ taskCount: count() })
    .from(releaseTasks)
    .where(eq(releaseTasks.releaseId, releaseId));

  if (existing && existing.taskCount > 0) {
    return getReleaseTasks(releaseId);
  }

  // Get release date for computing due dates
  const [release] = await db
    .select({ releaseDate: discogReleases.releaseDate })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  const releaseDate = release?.releaseDate;

  // Build task rows from template constant
  const taskRows = DEFAULT_RELEASE_TASK_TEMPLATE.map(
    (item: DefaultTemplateItem, index: number) => ({
      releaseId,
      creatorProfileId: profileId,
      title: item.title,
      description: item.description ?? null,
      explainerText: item.explainerText ?? null,
      learnMoreUrl: item.learnMoreUrl ?? null,
      category: item.category,
      status: 'todo' as const,
      priority: item.priority,
      position: index,
      assigneeType: item.assigneeType,
      aiWorkflowId: item.aiWorkflowId ?? null,
      dueDaysOffset: item.dueDaysOffset,
      dueDate: releaseDate
        ? computeDueDate(releaseDate, item.dueDaysOffset)
        : null,
    })
  );

  await db.insert(releaseTasks).values(taskRows);

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  return getReleaseTasks(releaseId);
}

// ─── Get Release Tasks ──────────────────────────────────────────────

export async function getReleaseTasks(releaseId: string) {
  const profileId = await requireProfileId();

  const tasks = await db
    .select()
    .from(releaseTasks)
    .where(
      and(
        eq(releaseTasks.releaseId, releaseId),
        eq(releaseTasks.creatorProfileId, profileId)
      )
    )
    .orderBy(releaseTasks.position);

  return tasks;
}

// ─── Update Release Task ────────────────────────────────────────────

export async function updateReleaseTask(
  taskId: string,
  data: {
    status?: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
    priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    assigneeType?: 'human' | 'ai_workflow';
    title?: string;
    description?: string | null;
    dueDate?: Date | null;
  }
) {
  const profileId = await requireProfileId();

  // Verify ownership
  const [task] = await db
    .select({ id: releaseTasks.id, releaseId: releaseTasks.releaseId })
    .from(releaseTasks)
    .where(
      and(
        eq(releaseTasks.id, taskId),
        eq(releaseTasks.creatorProfileId, profileId)
      )
    )
    .limit(1);

  if (!task) {
    throw new Error('Task not found or access denied');
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  // Set completedAt when status changes to done, clear when un-done
  if (data.status === 'done') {
    updateData.completedAt = new Date();
  } else if (data.status) {
    updateData.completedAt = null;
  }

  await db
    .update(releaseTasks)
    .set(updateData)
    .where(eq(releaseTasks.id, taskId));

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  return { success: true };
}

// ─── Add Release Task ───────────────────────────────────────────────

export async function addReleaseTask(
  releaseId: string,
  data: {
    title: string;
    description?: string;
    category?: string;
    priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    assigneeType?: 'human' | 'ai_workflow';
    dueDate?: Date;
  }
) {
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  // Get next position
  const [maxPos] = await db
    .select({ maxPosition: drizzleSql<number>`COALESCE(MAX(position), -1)` })
    .from(releaseTasks)
    .where(eq(releaseTasks.releaseId, releaseId));

  const [newTask] = await db
    .insert(releaseTasks)
    .values({
      releaseId,
      creatorProfileId: profileId,
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? 'Custom',
      priority: data.priority ?? 'medium',
      assigneeType: data.assigneeType ?? 'human',
      dueDate: data.dueDate ?? null,
      position: (maxPos?.maxPosition ?? -1) + 1,
    })
    .returning();

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  return newTask;
}

// ─── Delete Release Task ────────────────────────────────────────────

export async function deleteReleaseTask(taskId: string) {
  const profileId = await requireProfileId();

  const [task] = await db
    .select({ id: releaseTasks.id })
    .from(releaseTasks)
    .where(
      and(
        eq(releaseTasks.id, taskId),
        eq(releaseTasks.creatorProfileId, profileId)
      )
    )
    .limit(1);

  if (!task) {
    throw new Error('Task not found or access denied');
  }

  await db.delete(releaseTasks).where(eq(releaseTasks.id, taskId));

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  return { success: true };
}

// ─── Get Task Summary (for progress badges) ─────────────────────────

export async function getReleaseTaskSummary(profileId: string) {
  const rows = await db
    .select({
      releaseId: releaseTasks.releaseId,
      total: count(),
      done: drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'done')`,
    })
    .from(releaseTasks)
    .where(eq(releaseTasks.creatorProfileId, profileId))
    .groupBy(releaseTasks.releaseId);

  return new Map(
    rows.map(r => [r.releaseId, { total: r.total, done: Number(r.done) }])
  );
}

// ─── Recompute Due Dates (called when release date changes) ─────────

export async function recomputeTaskDueDates(
  releaseId: string,
  newReleaseDate: Date
) {
  await db.execute(drizzleSql`
    UPDATE release_tasks
    SET due_date = ${newReleaseDate}::timestamp + (due_days_offset || ' days')::interval,
        updated_at = NOW()
    WHERE release_id = ${releaseId}
      AND due_days_offset IS NOT NULL
  `);
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeDueDate(releaseDate: Date, offsetDays: number): Date {
  const date = new Date(releaseDate);
  date.setDate(date.getDate() + offsetDays);
  return date;
}
