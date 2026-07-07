import 'server-only';

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { feedbackItems } from '@/lib/db/schema/feedback';
import {
  type ModelExperiment,
  type ModelExperimentCandidate,
  modelExperiments,
  modelPromotions,
  modelUsageEvents,
} from '@/lib/db/schema/model-experiments';
import { logger } from '@/lib/utils/logger';
import { selectExperimentModel } from './select';
import { type ArmStats, buildEvidence, decidePromotion } from './stats';

/**
 * Serving + evaluation layer for per-workflow model A/B bake-offs
 * (GH #11462). Pure math lives in select.ts / stats.ts.
 */

/** Workflow key for the main authenticated chat surface. */
export const CHAT_WORKFLOW = 'chat';

/** Usage events older than this are pruned by the daily evaluation job. */
const USAGE_EVENT_RETENTION_DAYS = 90;

/** Per-instance experiment cache so the chat hot path adds ~zero DB reads. */
const EXPERIMENT_CACHE_TTL_MS = 60_000;
const experimentCache = new Map<
  string,
  { row: ModelExperiment | null; expiresAt: number }
>();

/** Test-only escape hatch. */
export function clearExperimentCacheForTesting(): void {
  experimentCache.clear();
}

/**
 * Estimated USD per 1M tokens (input/output) for cost-aware promotion.
 * Unpriced models fall back to avg-token comparison (see stats.ts).
 * Update alongside lib/constants/ai-models.ts when routing new models.
 */
const MODEL_PRICES_PER_MTOK: Record<
  string,
  { readonly input: number; readonly output: number }
> = {
  'anthropic/claude-sonnet-4-20250514': { input: 3, output: 15 },
  'anthropic/claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): number | null {
  const price = MODEL_PRICES_PER_MTOK[model];
  if (!price || (inputTokens == null && outputTokens == null)) return null;
  return (
    ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) /
    1_000_000
  );
}

async function loadExperiment(
  workflow: string
): Promise<ModelExperiment | null> {
  const cached = experimentCache.get(workflow);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  const rows = await db
    .select()
    .from(modelExperiments)
    .where(eq(modelExperiments.workflow, workflow))
    .limit(1);
  const row = rows[0] ?? null;
  experimentCache.set(workflow, {
    row,
    expiresAt: Date.now() + EXPERIMENT_CACHE_TTL_MS,
  });
  return row;
}

export interface ResolvedWorkflowModel {
  readonly model: string;
  /** True when this request is part of an active traffic split. */
  readonly isExperimentArm: boolean;
}

/**
 * Resolve the model to serve for a workflow request.
 *
 * - no row / paused / rolled_back → `fallback` (code default);
 * - promoted → the pinned winner;
 * - active / needs_decision → deterministic weighted split by `seed`
 *   (needs_decision keeps splitting so evidence accumulates while Tim
 *   makes the cost call).
 *
 * Fail-open: any DB error serves the fallback.
 */
export async function resolveWorkflowModel(
  workflow: string,
  fallback: string,
  seed: string
): Promise<ResolvedWorkflowModel> {
  try {
    const experiment = await loadExperiment(workflow);
    if (!experiment) return { model: fallback, isExperimentArm: false };

    if (experiment.status === 'promoted' && experiment.promotedModel) {
      return { model: experiment.promotedModel, isExperimentArm: false };
    }
    if (
      (experiment.status === 'active' ||
        experiment.status === 'needs_decision') &&
      experiment.candidates.length > 0
    ) {
      return {
        model: selectExperimentModel(experiment.candidates, seed),
        isExperimentArm: true,
      };
    }
    return { model: fallback, isExperimentArm: false };
  } catch (error) {
    logger.error(
      `[model-experiments] resolveWorkflowModel(${workflow}) failed; serving fallback`,
      error
    );
    return { model: fallback, isExperimentArm: false };
  }
}

/**
 * Log token usage for an experiment-arm request. Callers only invoke this
 * when `isExperimentArm` is true, so steady state (no experiment) writes
 * nothing. Never throws — usage logging must not break the request.
 */
export async function recordModelUsage(event: {
  workflow: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  requestId?: string | null;
}): Promise<void> {
  try {
    const inputTokens = normalizeTokens(event.inputTokens);
    const outputTokens = normalizeTokens(event.outputTokens);
    await db.insert(modelUsageEvents).values({
      workflow: event.workflow,
      model: event.model,
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens == null && outputTokens == null
          ? null
          : (inputTokens ?? 0) + (outputTokens ?? 0),
      costUsd: estimateCostUsd(event.model, inputTokens, outputTokens),
      requestId: event.requestId ?? null,
    });
  } catch (error) {
    logger.error('[model-experiments] recordModelUsage failed', error);
  }
}

function normalizeTokens(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

/** Vote + cost aggregates for every arm of an experiment. */
export async function collectArmStats(
  experiment: ModelExperiment
): Promise<ArmStats[]> {
  const models = experiment.candidates.map(c => c.model);
  if (models.length === 0) return [];

  const voteFilter = and(
    isNotNull(feedbackItems.vote),
    inArray(feedbackItems.modelUsed, models),
    gte(feedbackItems.createdAt, experiment.startedAt),
    experiment.feedbackToolName
      ? eq(feedbackItems.toolName, experiment.feedbackToolName)
      : eq(feedbackItems.toolCallId, '')
  );

  const voteRows = await db
    .select({
      model: feedbackItems.modelUsed,
      vote: feedbackItems.vote,
      count: sql<number>`count(*)::int`,
    })
    .from(feedbackItems)
    .where(voteFilter)
    .groupBy(feedbackItems.modelUsed, feedbackItems.vote);

  const usageRows = await db
    .select({
      model: modelUsageEvents.model,
      avgCostUsd: sql<number | null>`avg(${modelUsageEvents.costUsd})`,
      avgTotalTokens: sql<number | null>`avg(${modelUsageEvents.totalTokens})`,
    })
    .from(modelUsageEvents)
    .where(
      and(
        eq(modelUsageEvents.workflow, experiment.workflow),
        inArray(modelUsageEvents.model, models),
        gte(modelUsageEvents.createdAt, experiment.startedAt)
      )
    )
    .groupBy(modelUsageEvents.model);

  return experiment.candidates.map(candidate => {
    const up = voteRows.find(
      r => r.model === candidate.model && r.vote === 'up'
    );
    const down = voteRows.find(
      r => r.model === candidate.model && r.vote === 'down'
    );
    const usage = usageRows.find(r => r.model === candidate.model);
    return {
      model: candidate.model,
      upVotes: up?.count ?? 0,
      downVotes: down?.count ?? 0,
      avgCostUsd: toFiniteOrNull(usage?.avgCostUsd),
      avgTotalTokens: toFiniteOrNull(usage?.avgTotalTokens),
    };
  });
}

function toFiniteOrNull(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export interface ExperimentEvaluation {
  readonly workflow: string;
  readonly verdict: string;
  readonly detail?: string;
}

/**
 * Evaluate all active experiments and auto-promote winners under the
 * cost/quality rule. Runs as a daily-maintenance sub-job; also prunes
 * usage events past retention.
 */
export async function evaluateModelExperiments(): Promise<
  ExperimentEvaluation[]
> {
  const active = await db
    .select()
    .from(modelExperiments)
    .where(eq(modelExperiments.status, 'active'));

  const results: ExperimentEvaluation[] = [];
  for (const experiment of active) {
    const arms = await collectArmStats(experiment);
    if (arms.length < 2) {
      results.push({ workflow: experiment.workflow, verdict: 'hold' });
      continue;
    }
    const control = arms[0]!;
    const verdict = decidePromotion({
      arms,
      minVotesPerArm: experiment.minVotesPerArm,
      costTolerance: experiment.costTolerance,
    });

    if (verdict.kind === 'hold') {
      results.push({
        workflow: experiment.workflow,
        verdict: 'hold',
        detail: verdict.reason,
      });
      continue;
    }

    const evidence = buildEvidence(arms, control);
    if (verdict.kind === 'promote') {
      await db
        .update(modelExperiments)
        .set({
          status: 'promoted',
          promotedModel: verdict.winner,
          updatedAt: new Date(),
        })
        .where(eq(modelExperiments.workflow, experiment.workflow));
      await db.insert(modelPromotions).values({
        workflow: experiment.workflow,
        fromModel: control.model,
        toModel: verdict.winner,
        action: 'auto_promote',
        evidence,
      });
      experimentCache.delete(experiment.workflow);
      results.push({
        workflow: experiment.workflow,
        verdict: 'promoted',
        detail: verdict.winner,
      });
    } else {
      // Better quality at materially higher cost — Tim's call, keep splitting.
      await db
        .update(modelExperiments)
        .set({ status: 'needs_decision', updatedAt: new Date() })
        .where(eq(modelExperiments.workflow, experiment.workflow));
      await db.insert(modelPromotions).values({
        workflow: experiment.workflow,
        fromModel: control.model,
        toModel: verdict.winner,
        action: 'needs_decision',
        evidence,
      });
      experimentCache.delete(experiment.workflow);
      results.push({
        workflow: experiment.workflow,
        verdict: 'needs_decision',
        detail: verdict.winner,
      });
    }
  }

  // Retention: prune usage events older than the window.
  const cutoff = new Date(
    Date.now() - USAGE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  await db
    .delete(modelUsageEvents)
    .where(lt(modelUsageEvents.createdAt, cutoff));

  return results;
}

/**
 * Manual rollback: un-pin a promoted/escalated winner and pause the
 * experiment so the code-default model serves again.
 */
export async function rollbackExperiment(
  workflow: string,
  actor: string
): Promise<boolean> {
  const rows = await db
    .select()
    .from(modelExperiments)
    .where(eq(modelExperiments.workflow, workflow))
    .limit(1);
  const experiment = rows[0];
  if (!experiment) return false;

  await db
    .update(modelExperiments)
    .set({
      status: 'rolled_back',
      promotedModel: null,
      updatedAt: new Date(),
    })
    .where(eq(modelExperiments.workflow, workflow));
  await db.insert(modelPromotions).values({
    workflow,
    fromModel: experiment.promotedModel ?? experiment.candidates[0]!.model,
    toModel: null,
    action: 'rollback',
    evidence: { previousStatus: experiment.status },
    actor,
  });
  experimentCache.delete(workflow);
  return true;
}

export interface ExperimentDashboardRow {
  readonly experiment: ModelExperiment;
  readonly arms: ArmStats[];
}

/** Dashboard data: every experiment with per-arm quality/cost aggregates. */
export async function getExperimentDashboard(): Promise<{
  experiments: ExperimentDashboardRow[];
  recentPromotions: (typeof modelPromotions.$inferSelect)[];
}> {
  const experiments = await db.select().from(modelExperiments);
  const rows: ExperimentDashboardRow[] = [];
  for (const experiment of experiments) {
    rows.push({ experiment, arms: await collectArmStats(experiment) });
  }
  const recentPromotions = await db
    .select()
    .from(modelPromotions)
    .orderBy(desc(modelPromotions.createdAt))
    .limit(50);
  return { experiments: rows, recentPromotions };
}

/** Create or replace an experiment row (admin action). */
export async function upsertExperiment(input: {
  workflow: string;
  candidates: ModelExperimentCandidate[];
  feedbackToolName?: string | null;
  minVotesPerArm?: number;
  costTolerance?: number;
  updatedBy: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(modelExperiments)
    .values({
      workflow: input.workflow,
      status: 'active',
      candidates: input.candidates,
      promotedModel: null,
      feedbackToolName: input.feedbackToolName ?? null,
      minVotesPerArm: input.minVotesPerArm ?? 30,
      costTolerance: input.costTolerance ?? 0.05,
      updatedBy: input.updatedBy,
      startedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: modelExperiments.workflow,
      set: {
        status: 'active',
        candidates: input.candidates,
        promotedModel: null,
        feedbackToolName: input.feedbackToolName ?? null,
        minVotesPerArm: input.minVotesPerArm ?? 30,
        costTolerance: input.costTolerance ?? 0.05,
        updatedBy: input.updatedBy,
        startedAt: now,
        updatedAt: now,
      },
    });
  experimentCache.delete(input.workflow);
}

/** Pause an active experiment (admin action): fallback model serves. */
export async function pauseExperiment(
  workflow: string,
  actor: string
): Promise<boolean> {
  const updated = await db
    .update(modelExperiments)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(modelExperiments.workflow, workflow))
    .returning({ workflow: modelExperiments.workflow });
  if (updated.length === 0) return false;
  await db.insert(modelPromotions).values({
    workflow,
    fromModel: 'n/a',
    toModel: null,
    action: 'pause',
    evidence: {},
    actor,
  });
  experimentCache.delete(workflow);
  return true;
}
