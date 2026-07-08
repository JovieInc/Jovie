/**
 * Packaging Swap Experiment — WorkflowDefinition types (JovieInc/Jovie#10919)
 *
 * Each workflow_run of this kind tracks one sequential thumbnail swap test
 * for a single YouTube video. The run is self-contained: all metrics and
 * decisions live in stepOutputs so the cron can resume from any phase.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Workflow kind constant (registered in process-workflow-runs cron dispatcher)
// ---------------------------------------------------------------------------

export const PACKAGING_SWAP_EXPERIMENT_WORKFLOW_KIND =
  'packaging_swap_experiment' as const;

// ---------------------------------------------------------------------------
// Guardrail defaults (overridable per-run via stepOutputs)
// ---------------------------------------------------------------------------

/** Minimum impressions required per variant before a winner can be declared. */
export const MIN_IMPRESSIONS_PER_VARIANT = 500;

/** Minimum Bayesian P(B > A) required to call treatment the winner. */
export const MIN_BAYESIAN_CONFIDENCE = 0.95;

/** Minimum experiment wall-clock duration in hours before declaring a winner. */
export const MIN_EXPERIMENT_DURATION_HOURS = 24;

/** Minimum average-view-duration in the treatment must be >= this fraction of control. */
export const MIN_AVD_RATIO = 0.95;

/** Minimum hours between consecutive swaps on the same video (anti-thrash guard). */
export const MIN_HOURS_BETWEEN_SWAPS = 48;

// ---------------------------------------------------------------------------
// Per-variant metrics (populated by the metrics-fetch step)
// ---------------------------------------------------------------------------

export interface VariantMetrics {
  /** Variant label: 'control' or 'treatment'. */
  readonly variant: 'control' | 'treatment';
  /** Total impressions delivered while this thumbnail was active. */
  readonly impressions: number;
  /** Total watch minutes accumulated during this period. */
  readonly watchMinutes: number;
  /** Average view duration in seconds (for regression guard). */
  readonly avgViewDurationSeconds: number;
  /** ISO timestamp of the start of this variant's exposure window. */
  readonly windowStart: string;
  /** ISO timestamp of the end of this variant's exposure window (null = still active). */
  readonly windowEnd: string | null;
}

// ---------------------------------------------------------------------------
// Decision log
// ---------------------------------------------------------------------------

export type DecisionOutcome =
  | 'treatment_wins'
  | 'control_wins'
  | 'inconclusive'
  | 'guardrail_blocked'
  | 'swap_executed'
  | 'rollback_executed'
  | 'waiting_for_approval';

export interface DecisionLogEntry {
  readonly decidedAt: string;
  readonly outcome: DecisionOutcome;
  /** P(treatment > control), null if guardrail blocked before Bayesian eval. */
  readonly confidence: number | null;
  /** watch_minutes / impressions for control at decision time. */
  readonly controlRate: number | null;
  /** watch_minutes / impressions for treatment at decision time. */
  readonly treatmentRate: number | null;
  /** Human-readable explanation of why this decision was made. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Experiment step outputs — stored in workflow_runs.stepOutputs (JSONB)
// ---------------------------------------------------------------------------

export type ExperimentPhase =
  | 'initializing' // Waiting for treatment thumbnail to be available
  | 'running' // Actively accumulating metrics for treatment variant
  | 'decided' // Winner selected; swap or rollback executed (or pending approval)
  | 'failed';

export interface PackagingSwapExperimentStepOutputs {
  /** YouTube video ID. */
  readonly videoId: string;
  /** YouTube channel ID. */
  readonly channelId: string;
  /** Jovie user ID. */
  readonly userId: string;
  /** Topic/niche tag for learning-layer attribution (null = channel-level). */
  readonly topic: string | null;
  /** ISO timestamp when the experiment was first enqueued. */
  readonly startedAt: string;
  /** Custom guardrail overrides (null = use defaults above). */
  readonly minImpressionsPerVariant: number;
  readonly minBayesianConfidence: number;
  readonly minExperimentDurationHours: number;
  /** Current phase of the experiment. */
  readonly phase: ExperimentPhase;
  /** Metrics for the control variant (original thumbnail). */
  readonly control: VariantMetrics | null;
  /** Metrics for the treatment variant (new thumbnail). */
  readonly treatment: VariantMetrics | null;
  /**
   * When false: the run halts at 'waiting_for_approval' before any swap/rollback.
   * The user must manually approve the swap via a separate action.
   * Default: false (safe).
   */
  readonly autoPublishEnabled: boolean;
  /** ISO timestamp of the most recent swap on this video (any prior experiment). */
  readonly lastSwappedAt: string | null;
  /** URL of the treatment thumbnail asset (provided by thumbnail generator). */
  readonly treatmentThumbnailUrl: string | null;
  /** Immutable append-only audit log of every decision made by this run. */
  readonly decisionLog: readonly DecisionLogEntry[];
  /** Final winner — set when phase = 'decided'. */
  readonly winner: 'control' | 'treatment' | 'inconclusive' | null;
}

// ---------------------------------------------------------------------------
// Zod input schema — validated when a new experiment run is enqueued
// ---------------------------------------------------------------------------

export const packagingSwapExperimentInputSchema = z.object({
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  userId: z.string().min(1),
  topic: z.string().nullable().default(null),
  treatmentThumbnailUrl: z.string().url().nullable().default(null),
  autoPublishEnabled: z.boolean().default(false),
  minImpressionsPerVariant: z
    .number()
    .int()
    .min(50)
    .default(MIN_IMPRESSIONS_PER_VARIANT),
  minBayesianConfidence: z
    .number()
    .min(0)
    .max(1)
    .default(MIN_BAYESIAN_CONFIDENCE),
  minExperimentDurationHours: z
    .number()
    .min(1)
    .default(MIN_EXPERIMENT_DURATION_HOURS),
  lastSwappedAt: z.string().nullable().default(null),
});

export type PackagingSwapExperimentInput = z.infer<
  typeof packagingSwapExperimentInputSchema
>;
