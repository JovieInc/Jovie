'use server';

import { and, count, sql as drizzleSql, eq, isNull, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  releaseSkillClusters,
  releaseTaskCatalog,
  releaseTaskSnapshots,
} from '@/lib/db/schema/release-tasks';
import { tasks } from '@/lib/db/schema/tasks';
import {
  requireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess,
} from '@/lib/entitlements/tasks-gate';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import {
  type CatalogRow,
  type SelectionResult,
  selectTasks,
} from '@/lib/release-tasks/select-tasks';
import { requireProfileId } from '../requireProfileId';
import { getReleaseTasks } from './task-actions';

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
  if (!release) throw new Error('Release not found or access denied');
}

function computeDueDate(releaseDate: Date, offsetDays: number): Date {
  const d = new Date(releaseDate);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function loadCatalog(): Promise<CatalogRow[]> {
  const rows = await db
    .select({
      slug: releaseTaskCatalog.slug,
      name: releaseTaskCatalog.name,
      category: releaseTaskCatalog.category,
      clusterId: releaseTaskCatalog.clusterId,
      shortDescription: releaseTaskCatalog.shortDescription,
      priority: releaseTaskCatalog.priority,
      flowStageDaysOffset: releaseTaskCatalog.flowStageDaysOffset,
      applicabilityRules: releaseTaskCatalog.applicabilityRules,
      aiSkillStatus: releaseTaskCatalog.aiSkillStatus,
      aiSkillId: releaseTaskCatalog.aiSkillId,
      assigneeType: releaseTaskCatalog.assigneeType,
      catalogVersion: releaseTaskCatalog.catalogVersion,
    })
    .from(releaseTaskCatalog);
  return rows as CatalogRow[];
}

/**
 * Generate a release task plan from the canonical catalog using a wizard context.
 * Writes both `tasks` rows (for status/completion tracking) and
 * `release_task_snapshots` (denormalized catalog provenance).
 */
export async function instantiateReleaseTasksFromCatalog(
  releaseId: string,
  ctx: ReleaseContext
) {
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

  const catalog = await loadCatalog();
  const selections: SelectionResult[] = selectTasks(ctx, catalog);
  if (selections.length === 0) return getReleaseTasks(releaseId);

  const catalogBySlug = new Map(catalog.map(r => [r.slug, r]));

  const [release, positionRow, counterRow] = await Promise.all([
    db
      .select({
        releaseDate: discogReleases.releaseDate,
        metadata: discogReleases.metadata,
      })
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
        nextTaskNumber: drizzleSql`${creatorProfiles.nextTaskNumber} + ${selections.length}`,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId))
      .returning({ nextTaskNumber: creatorProfiles.nextTaskNumber })
      .then(rows => rows[0]),
  ]);

  const firstTaskNumber =
    (counterRow?.nextTaskNumber ?? selections.length + 1) - selections.length;
  const startPosition = (positionRow?.maxPosition ?? -1) + 1;
  const releaseDate = release?.releaseDate ?? null;

  const taskRows = selections.map((sel, index) => {
    const row = catalogBySlug.get(sel.slug);
    if (!row) throw new Error(`Catalog row not found for slug: ${sel.slug}`);
    return {
      taskNumber: firstTaskNumber + index,
      creatorProfileId: profileId,
      title: row.name,
      description: row.shortDescription ?? null,
      status: 'todo' as const,
      priority: row.priority,
      assigneeKind:
        row.assigneeType === 'ai_workflow'
          ? ('jovie' as const)
          : ('human' as const),
      agentType: row.aiSkillId ?? null,
      agentStatus: 'idle' as const,
      releaseId,
      category: row.category,
      dueAt:
        releaseDate === null || row.flowStageDaysOffset === null
          ? null
          : computeDueDate(releaseDate, row.flowStageDaysOffset),
      position: startPosition + index,
      sourceTemplateId: null,
      metadata: {
        dueDaysOffset: row.flowStageDaysOffset,
        catalogSlug: row.slug,
        catalogVersion: row.catalogVersion,
        selectionScore: sel.score,
        selectionReasons: sel.reasons,
      },
    };
  });

  const snapshotRows = selections.map(sel => {
    const row = catalogBySlug.get(sel.slug);
    if (!row) throw new Error(`Catalog row not found for slug: ${sel.slug}`);
    return {
      releaseId,
      catalogSlug: row.slug,
      catalogVersion: row.catalogVersion,
      name: row.name,
      category: row.category,
      clusterId: row.clusterId,
      shortDescription: row.shortDescription,
      priority: row.priority,
      flowStageDaysOffset: row.flowStageDaysOffset,
      assigneeType: row.assigneeType,
      aiSkillId: row.aiSkillId,
      aiSkillStatus: row.aiSkillStatus,
      reasons: sel.reasons,
      score: sel.score,
    };
  });

  await db.transaction(async tx => {
    await tx.insert(tasks).values(taskRows);
    await tx.insert(releaseTaskSnapshots).values(snapshotRows);

    // Persist wizard answers on discogReleases.metadata (no schema change).
    const currentMetadata =
      (release?.metadata as Record<string, unknown> | null) ?? {};
    await tx
      .update(discogReleases)
      .set({
        metadata: {
          ...currentMetadata,
          planWizardAnswers: ctx,
          catalogVersionAtInstantiation:
            snapshotRows[0]?.catalogVersion ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(discogReleases.id, releaseId));
  });

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  revalidatePath(APP_ROUTES.TASKS);

  return getReleaseTasks(releaseId);
}

/**
 * Admin helper: explain which catalog rules fired for a given release.
 * Reads the wizard answers persisted on the release metadata.
 */
export async function getReleaseSelectionExplanation(releaseId: string) {
  await requireTasksWorkspaceAccess();
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);

  const [release] = await db
    .select({ metadata: discogReleases.metadata })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);
  const answers = (release?.metadata as Record<string, unknown> | null)
    ?.planWizardAnswers as ReleaseContext | undefined;
  if (!answers) return { ctx: null, explanation: [] };

  const catalog = await loadCatalog();
  const { explainSelection } = await import('@/lib/release-tasks/select-tasks');
  return {
    ctx: answers,
    explanation: explainSelection(answers, catalog),
  };
}

/**
 * Read-only: list clusters for filter-chip UI.
 */
export async function listReleaseSkillClusters() {
  await requireTasksWorkspaceAccess();
  const rows = await db
    .select({
      id: releaseSkillClusters.id,
      slug: releaseSkillClusters.slug,
      displayName: releaseSkillClusters.displayName,
      displayOrder: releaseSkillClusters.displayOrder,
      status: releaseSkillClusters.status,
      demandScore: releaseSkillClusters.demandScore,
    })
    .from(releaseSkillClusters)
    .orderBy(releaseSkillClusters.displayOrder);
  return rows;
}
