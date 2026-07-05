/**
 * Manual-vs-automated release-cycle step classification (#12144).
 *
 * Canonical release-cycle step list (anchored to the release-workflow demo,
 * #8684), per-step baseline manual minutes, event recording, and the
 * per-release automation summary that yields the VC-traction metric
 * "N manual tasks eliminated per release cycle".
 *
 * BASELINE ASSUMPTION (labeled): the per-step manual-minutes baseline models
 * what a non-Jovie artist does by hand, from the founder's 15-year workflow
 * canon. It is a stated assumption, not a measurement.
 */

import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { releaseCycleStepEvents } from '@/lib/db/schema/connectors';
import { logger } from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Canonical step list
// ---------------------------------------------------------------------------

export type ReleaseCycleStepSource = 'automation' | 'manual' | 'skipped';

export interface ReleaseCycleStepDefinition {
  readonly key: string;
  readonly label: string;
  /**
   * Baseline minutes a non-Jovie artist spends doing this step manually.
   * Labeled assumption (founder workflow canon), used for the time-saved proxy.
   */
  readonly baselineManualMinutes: number;
}

/** Canonical release-cycle steps, in lifecycle order (per #8684 demo workflow). */
export const RELEASE_CYCLE_STEPS: readonly ReleaseCycleStepDefinition[] = [
  { key: 'metadata', label: 'Release metadata', baselineManualMinutes: 30 },
  { key: 'smart_links', label: 'Smart links', baselineManualMinutes: 25 },
  { key: 'pre_save', label: 'Pre-save campaign', baselineManualMinutes: 30 },
  { key: 'press', label: 'Press / EPK', baselineManualMinutes: 90 },
  { key: 'playlists', label: 'Playlist pitching', baselineManualMinutes: 60 },
  {
    key: 'content_posts',
    label: 'Content posts',
    baselineManualMinutes: 45,
  },
  {
    key: 'fan_notifications',
    label: 'Fan notifications (SMS/email)',
    baselineManualMinutes: 30,
  },
  { key: 'merch', label: 'Merch drop', baselineManualMinutes: 120 },
  { key: 'reporting', label: 'Reporting', baselineManualMinutes: 30 },
] as const;

export const RELEASE_CYCLE_STEP_KEYS: readonly string[] =
  RELEASE_CYCLE_STEPS.map(step => step.key);

export function isReleaseCycleStepKey(key: string): boolean {
  return RELEASE_CYCLE_STEP_KEYS.includes(key);
}

// ---------------------------------------------------------------------------
// Recording (fail-soft)
// ---------------------------------------------------------------------------

export interface RecordReleaseCycleStepEventInput {
  readonly userId: string;
  readonly releaseId: string;
  readonly step: string;
  readonly source: ReleaseCycleStepSource;
  readonly workflowRunId?: string | null;
}

/**
 * Record how a release-cycle step was executed. Upserts on (releaseId, step)
 * so re-runs keep the latest classification. Fail-soft: classification must
 * never break the workflow that reports it.
 */
export async function recordReleaseCycleStepEvent(
  input: RecordReleaseCycleStepEventInput
): Promise<void> {
  if (!isReleaseCycleStepKey(input.step)) {
    logger.warn('[release-cycle-classification] unknown step key', {
      step: input.step,
      releaseId: input.releaseId,
    });
  }

  try {
    await db
      .insert(releaseCycleStepEvents)
      .values({
        userId: input.userId,
        releaseId: input.releaseId,
        step: input.step,
        source: input.source,
        workflowRunId: input.workflowRunId ?? null,
      })
      .onConflictDoUpdate({
        target: [releaseCycleStepEvents.releaseId, releaseCycleStepEvents.step],
        set: {
          source: input.source,
          workflowRunId: input.workflowRunId ?? null,
          createdAt: drizzleSql`now()`,
        },
      });
  } catch (err) {
    logger.error('[release-cycle-classification] failed to record step event', {
      releaseId: input.releaseId,
      step: input.step,
      err,
    });
  }
}

// ---------------------------------------------------------------------------
// Derivation (pure — unit-testable without a DB)
// ---------------------------------------------------------------------------

export interface ReleaseStepClassification {
  readonly step: string;
  readonly source: ReleaseCycleStepSource;
}

export interface ReleaseAutomationSummary {
  readonly automatedSteps: number;
  readonly manualSteps: number;
  readonly skippedSteps: number;
  /** Canonical steps with no recorded event (untracked — counted as skipped-unknown). */
  readonly untrackedSteps: number;
  /**
   * Baseline manual steps (all canonical steps, labeled assumption) minus
   * steps actually done manually. Skipped/untracked steps do not count as
   * eliminated — Jovie didn't do them.
   */
  readonly manualTasksEliminated: number;
  /** Time-saved proxy: Σ baselineManualMinutes of automated steps. */
  readonly timeSavedMinutes: number;
}

/**
 * Derive the per-release summary from recorded step classifications.
 * manual_tasks_eliminated = automated steps (each one would have been manual
 * under the labeled baseline where a non-Jovie artist does every step by hand).
 */
export function deriveReleaseAutomationSummary(
  events: readonly ReleaseStepClassification[]
): ReleaseAutomationSummary {
  const byStep = new Map<string, ReleaseCycleStepSource>();
  for (const event of events) {
    if (isReleaseCycleStepKey(event.step)) {
      byStep.set(event.step, event.source);
    }
  }

  let automatedSteps = 0;
  let manualSteps = 0;
  let skippedSteps = 0;
  let untrackedSteps = 0;
  let timeSavedMinutes = 0;

  for (const definition of RELEASE_CYCLE_STEPS) {
    const source = byStep.get(definition.key);
    if (source === 'automation') {
      automatedSteps += 1;
      timeSavedMinutes += definition.baselineManualMinutes;
    } else if (source === 'manual') {
      manualSteps += 1;
    } else if (source === 'skipped') {
      skippedSteps += 1;
    } else {
      untrackedSteps += 1;
    }
  }

  return {
    automatedSteps,
    manualSteps,
    skippedSteps,
    untrackedSteps,
    manualTasksEliminated: automatedSteps,
    timeSavedMinutes,
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getReleaseAutomationSummary(
  releaseId: string
): Promise<ReleaseAutomationSummary> {
  const result = await db.execute<{
    step: string;
    source: ReleaseCycleStepSource;
  }>(drizzleSql`
    SELECT step, source
    FROM release_cycle_step_events
    WHERE release_id = ${releaseId}
  `);

  const rows =
    (
      result as {
        rows?: Array<{ step: string; source: ReleaseCycleStepSource }>;
      }
    ).rows ?? [];

  return deriveReleaseAutomationSummary(rows);
}
