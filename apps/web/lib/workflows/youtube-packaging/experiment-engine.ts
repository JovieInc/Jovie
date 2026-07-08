/**
 * YouTube Packaging Experiment Engine (JovieInc/Jovie#10919).
 *
 * Runs sequential thumbnail swap tests, picks winners by watch time via
 * Bayesian confidence, and logs every decision. Registered as a first-class
 * WorkflowDefinition (JovieInc/Jovie#10367).
 *
 * Decision metric: watch_minutes_per_impression = impressions_ctr × avg_view_duration.
 * NOT CTR alone — a thumbnail that wins clicks but loses retention must lose.
 *
 * Guardrails (all must pass before any swap):
 *   1. Min impressions per variant (default 500) — statistical power
 *   2. Min test duration (default 72 h) — avoid weekend/weekday bias
 *   3. Max test duration (default 30 days) — stale experiment cleanup
 *   4. No avg-view-duration regression > 5% — retention floor
 *   5. Min swap cooldown (default 7 days) — no rapid re-swaps
 *
 * Bayesian winner:
 *   P(treatment > control) computed via Gaussian approximation of rate difference.
 *   Swap when P ≥ winThreshold (default 0.90).
 *   Rollback when P ≤ loseThreshold (default 0.10).
 *
 * Auto-swap is gated behind autoPublishEnabled. When false, decision kind is
 * 'awaiting_approval' and a human must confirm before the swap executes.
 *
 * Pure functions only — DB / API side-effects are the caller's concern.
 */

import { z } from 'zod';
import { computeRatePercent } from '@/lib/analytics/metrics';
import {
  DEFAULT_RETRY_POLICY,
  registerWorkflow,
} from '@/lib/workflows/registry';

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const YOUTUBE_PACKAGING_EXPERIMENT_KIND =
  'youtube_packaging_experiment' as const;

/** Default minimum impressions before statistical evaluation begins. */
export const DEFAULT_MIN_IMPRESSIONS = 500;

/** Default Bayesian win threshold: P(treatment > control) ≥ 0.90. */
export const DEFAULT_WIN_THRESHOLD = 0.9;

/** Default Bayesian lose threshold: P(treatment > control) ≤ 0.10. */
export const DEFAULT_LOSE_THRESHOLD = 0.1;

/** Default max regression tolerance for avg-view-duration (5%). */
export const DEFAULT_MAX_REGRESSION_PCT = 0.05;

const MS_PER_HOUR = 60 * 60 * 1000;

export const DEFAULT_MIN_TEST_DURATION_MS = 72 * MS_PER_HOUR;
export const DEFAULT_MAX_TEST_DURATION_MS = 30 * 24 * MS_PER_HOUR;
export const DEFAULT_MIN_SWAP_COOLDOWN_MS = 7 * 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// Input / state types
// ---------------------------------------------------------------------------

export interface VariantMetrics {
  /** Total thumbnail impressions during the test window. */
  readonly impressions: number;
  /** Total watch minutes accumulated across all viewers in the test window. */
  readonly watchMinutes: number;
  /** Average view duration in seconds (for regression guard). */
  readonly avgViewDurationSeconds: number;
}

export interface ExperimentConfig {
  readonly minImpressionsPerVariant: number;
  readonly minTestDurationMs: number;
  readonly maxTestDurationMs: number;
  readonly minSwapCooldownMs: number;
  readonly winThreshold: number;
  readonly loseThreshold: number;
  readonly maxAvgViewDurationRegressionPct: number;
}

export const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  minImpressionsPerVariant: DEFAULT_MIN_IMPRESSIONS,
  minTestDurationMs: DEFAULT_MIN_TEST_DURATION_MS,
  maxTestDurationMs: DEFAULT_MAX_TEST_DURATION_MS,
  minSwapCooldownMs: DEFAULT_MIN_SWAP_COOLDOWN_MS,
  winThreshold: DEFAULT_WIN_THRESHOLD,
  loseThreshold: DEFAULT_LOSE_THRESHOLD,
  maxAvgViewDurationRegressionPct: DEFAULT_MAX_REGRESSION_PCT,
};

export interface ExperimentState {
  readonly experimentId: string;
  readonly videoId: string;
  readonly channelId: string;
  /** ISO-8601 timestamp when the test was first launched. */
  readonly startedAt: string;
  /** ISO-8601 timestamp of the most recent thumbnail swap, or null. */
  readonly lastSwapAt: string | null;
  /** Control variant (current / original thumbnail). */
  readonly control: VariantMetrics;
  /** Treatment variant (challenger thumbnail). */
  readonly treatment: VariantMetrics;
  /**
   * When false: the user has enabled "never auto-publish without approval".
   * A winning decision becomes 'awaiting_approval' instead of 'swap_treatment'.
   */
  readonly autoPublishEnabled: boolean;
  /** Override current time (ISO-8601) — for deterministic tests. */
  readonly nowIso?: string;
}

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

export type ExperimentDecisionKind =
  | 'continue' // not enough data yet, keep collecting
  | 'swap_treatment' // treatment wins, apply it
  | 'rollback_control' // treatment loses or regresses, restore control
  | 'inconclusive' // test timed out without clear winner
  | 'awaiting_approval'; // winner found, but auto-swap disabled

export interface ExperimentGuardrailViolation {
  readonly rule: string;
  readonly detail: string;
}

export interface ExperimentDecision {
  readonly kind: ExperimentDecisionKind;
  /** P(treatment watch_minutes_per_impression > control). */
  readonly probTreatmentWins: number;
  readonly watchMinutesPerImpressionControl: number;
  readonly watchMinutesPerImpressionTreatment: number;
  readonly guardrailViolations: readonly ExperimentGuardrailViolation[];
  /** Human-readable explanation for the decision log. */
  readonly rationale: string;
  readonly decidedAt: string;
  /** True when decision requires human confirmation before swap executes. */
  readonly requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Decision log entry (persisted by the caller)
// ---------------------------------------------------------------------------

export interface ExperimentDecisionLogEntry {
  readonly experimentId: string;
  readonly videoId: string;
  readonly channelId: string;
  readonly decision: ExperimentDecision;
  readonly controlMetrics: VariantMetrics;
  readonly treatmentMetrics: VariantMetrics;
  readonly loggedAt: string;
}

// ---------------------------------------------------------------------------
// Bayesian statistics — pure, zero-dependency
// ---------------------------------------------------------------------------

/**
 * Standard normal CDF via the Abramowitz & Stegun polynomial approximation.
 * Accurate to ~7 decimal places across the real line.
 *
 * @internal exported for unit tests only
 */
export function normalCdf(z: number): number {
  // Reflect for negative z: Φ(-z) = 1 - Φ(z)
  const sign = z >= 0 ? 1 : -1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.398942282 * Math.exp(-0.5 * z * z);
  const poly =
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  const tail = d * poly;
  return sign === 1 ? 1 - tail : tail;
}

/**
 * Computes watch_minutes_per_impression for a variant.
 * Returns 0 when impressions === 0 to avoid division-by-zero.
 */
export function watchMinutesPerImpression(m: VariantMetrics): number {
  return m.impressions > 0 ? m.watchMinutes / m.impressions : 0;
}

/**
 * P(treatment watch_minutes_per_impression > control) via Gaussian approximation.
 *
 * Models each variant as a Poisson rate:
 *   rate = watchMinutes / impressions
 *   SE²  = rate / impressions   (Poisson rate standard error)
 *
 * P(B > A) = Φ((rate_B - rate_A) / sqrt(SE_A² + SE_B²))
 *
 * Returns 0.5 when either variant has zero impressions (no information).
 */
export function computeBayesianProbBOverA(
  control: VariantMetrics,
  treatment: VariantMetrics
): number {
  if (control.impressions === 0 || treatment.impressions === 0) return 0.5;

  const rateA = watchMinutesPerImpression(control);
  const rateB = watchMinutesPerImpression(treatment);

  // Poisson SE²: guard against zero rates to avoid NaN
  const seA2 =
    rateA > 0 ? rateA / control.impressions : 1 / control.impressions;
  const seB2 =
    rateB > 0 ? rateB / treatment.impressions : 1 / treatment.impressions;

  const pooledSE = Math.sqrt(seA2 + seB2);
  if (pooledSE === 0) return rateB > rateA ? 1 : rateB < rateA ? 0 : 0.5;

  return normalCdf((rateB - rateA) / pooledSE);
}

// ---------------------------------------------------------------------------
// Guardrail checks
// ---------------------------------------------------------------------------

function checkGuardrails(
  state: ExperimentState,
  config: ExperimentConfig,
  now: Date
): ExperimentGuardrailViolation[] {
  const violations: ExperimentGuardrailViolation[] = [];

  // 1. Min impressions per variant
  if (state.control.impressions < config.minImpressionsPerVariant) {
    violations.push({
      rule: 'min_impressions',
      detail: `control impressions ${state.control.impressions} < ${config.minImpressionsPerVariant}`,
    });
  }
  if (state.treatment.impressions < config.minImpressionsPerVariant) {
    violations.push({
      rule: 'min_impressions',
      detail: `treatment impressions ${state.treatment.impressions} < ${config.minImpressionsPerVariant}`,
    });
  }

  // 2. Min test duration
  const elapsedMs = now.getTime() - new Date(state.startedAt).getTime();
  if (elapsedMs < config.minTestDurationMs) {
    const remaining = Math.ceil(
      (config.minTestDurationMs - elapsedMs) / MS_PER_HOUR
    );
    violations.push({
      rule: 'min_duration',
      detail: `${remaining}h remaining before minimum test window`,
    });
  }

  // 3. Swap cooldown — avoid rapid re-swaps
  if (state.lastSwapAt !== null) {
    const cooldownRemaining =
      config.minSwapCooldownMs -
      (now.getTime() - new Date(state.lastSwapAt).getTime());
    if (cooldownRemaining > 0) {
      const remainingH = Math.ceil(cooldownRemaining / MS_PER_HOUR);
      violations.push({
        rule: 'swap_cooldown',
        detail: `${remainingH}h cooldown remaining since last swap`,
      });
    }
  }

  // 4. Avg-view-duration regression guard
  // Treatment avgViewDuration must be ≥ control × (1 − maxRegressionPct)
  if (
    state.control.avgViewDurationSeconds > 0 &&
    state.treatment.impressions >= config.minImpressionsPerVariant
  ) {
    const floor =
      state.control.avgViewDurationSeconds *
      (1 - config.maxAvgViewDurationRegressionPct);
    if (state.treatment.avgViewDurationSeconds < floor) {
      const regressionPct = (
        ((state.control.avgViewDurationSeconds -
          state.treatment.avgViewDurationSeconds) /
          state.control.avgViewDurationSeconds) *
        100
      ).toFixed(1);
      violations.push({
        rule: 'avg_view_duration_regression',
        detail: `treatment avg-view-duration ${state.treatment.avgViewDurationSeconds.toFixed(1)}s vs control ${state.control.avgViewDurationSeconds.toFixed(1)}s (regression ${regressionPct}%)`,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate the current experiment state and produce a decision.
 *
 * Pure function — no DB or API calls. Callers are responsible for:
 * 1. Fetching fresh metrics from the YouTube Analytics connector.
 * 2. Persisting the returned ExperimentDecisionLogEntry.
 * 3. Executing the swap / rollback / approval queue based on decision.kind.
 */
export function evaluatePackagingExperiment(
  state: ExperimentState,
  config: Partial<ExperimentConfig> = {}
): ExperimentDecision {
  const cfg = { ...DEFAULT_EXPERIMENT_CONFIG, ...config };
  const now = state.nowIso ? new Date(state.nowIso) : new Date();
  const decidedAt = now.toISOString();

  const rateControl = watchMinutesPerImpression(state.control);
  const rateTreatment = watchMinutesPerImpression(state.treatment);
  const prob = computeBayesianProbBOverA(state.control, state.treatment);

  // Check for AVD regression independently — this can trigger a rollback even
  // before the min-impressions/min-duration guardrails are satisfied.
  const avdFloor =
    state.control.avgViewDurationSeconds *
    (1 - cfg.maxAvgViewDurationRegressionPct);
  const avdRegressionDetected =
    state.control.avgViewDurationSeconds > 0 &&
    state.treatment.impressions >= cfg.minImpressionsPerVariant &&
    state.treatment.avgViewDurationSeconds < avdFloor;

  if (avdRegressionDetected) {
    const regressionPct = (
      ((state.control.avgViewDurationSeconds -
        state.treatment.avgViewDurationSeconds) /
        state.control.avgViewDurationSeconds) *
      100
    ).toFixed(1);
    return {
      kind: 'rollback_control',
      probTreatmentWins: prob,
      watchMinutesPerImpressionControl: rateControl,
      watchMinutesPerImpressionTreatment: rateTreatment,
      guardrailViolations: [
        {
          rule: 'avg_view_duration_regression',
          detail: `treatment avg-view-duration regressed ${regressionPct}%`,
        },
      ],
      rationale: `Rolling back: treatment avg-view-duration dropped ${regressionPct}% below control floor despite impressions.`,
      decidedAt,
      requiresApproval: false,
    };
  }

  // Max test duration — inconclusive timeout
  const elapsedMs = now.getTime() - new Date(state.startedAt).getTime();
  if (elapsedMs > cfg.maxTestDurationMs) {
    return {
      kind: 'inconclusive',
      probTreatmentWins: prob,
      watchMinutesPerImpressionControl: rateControl,
      watchMinutesPerImpressionTreatment: rateTreatment,
      guardrailViolations: [],
      rationale: `Test exceeded max duration (${Math.round(elapsedMs / (24 * MS_PER_HOUR))}d) without a clear winner. P(treatment wins) = ${(prob * 100).toFixed(1)}%.`,
      decidedAt,
      requiresApproval: false,
    };
  }

  // Collect remaining guardrail violations (min impressions, duration, cooldown)
  const guardrailViolations = checkGuardrails(state, cfg, now);
  if (guardrailViolations.length > 0) {
    return {
      kind: 'continue',
      probTreatmentWins: prob,
      watchMinutesPerImpressionControl: rateControl,
      watchMinutesPerImpressionTreatment: rateTreatment,
      guardrailViolations,
      rationale: `Continuing: ${guardrailViolations.map(v => v.detail).join('; ')}.`,
      decidedAt,
      requiresApproval: false,
    };
  }

  // Bayesian decision
  if (prob >= cfg.winThreshold) {
    const liftPct = computeRatePercent(
      rateTreatment - rateControl,
      rateControl || 1
    ).toFixed(1);
    const kind = state.autoPublishEnabled
      ? 'swap_treatment'
      : 'awaiting_approval';
    return {
      kind,
      probTreatmentWins: prob,
      watchMinutesPerImpressionControl: rateControl,
      watchMinutesPerImpressionTreatment: rateTreatment,
      guardrailViolations: [],
      rationale:
        kind === 'swap_treatment'
          ? `Swapping to treatment: P(treatment wins) = ${(prob * 100).toFixed(1)}%, lift +${liftPct}% watch-min/impression.`
          : `Treatment wins (P=${(prob * 100).toFixed(1)}%, lift +${liftPct}%) but auto-publish is disabled. Queued for approval.`,
      decidedAt,
      requiresApproval: !state.autoPublishEnabled,
    };
  }

  if (prob <= cfg.loseThreshold) {
    const liftPct = computeRatePercent(
      rateTreatment - rateControl,
      rateControl || 1
    ).toFixed(1);
    return {
      kind: 'rollback_control',
      probTreatmentWins: prob,
      watchMinutesPerImpressionControl: rateControl,
      watchMinutesPerImpressionTreatment: rateTreatment,
      guardrailViolations: [],
      rationale: `Rolling back: P(treatment wins) = ${(prob * 100).toFixed(1)}%, treatment underperforms by ${Math.abs(Number(liftPct)).toFixed(1)}%.`,
      decidedAt,
      requiresApproval: false,
    };
  }

  return {
    kind: 'continue',
    probTreatmentWins: prob,
    watchMinutesPerImpressionControl: rateControl,
    watchMinutesPerImpressionTreatment: rateTreatment,
    guardrailViolations: [],
    rationale: `Continuing: P(treatment wins) = ${(prob * 100).toFixed(1)}% — neither win nor lose threshold reached.`,
    decidedAt,
    requiresApproval: false,
  };
}

/**
 * Build a decision log entry for durable audit storage.
 * Callers persist this to their preferred store (DB, S3, etc.).
 */
export function buildDecisionLogEntry(
  state: ExperimentState,
  decision: ExperimentDecision
): ExperimentDecisionLogEntry {
  return {
    experimentId: state.experimentId,
    videoId: state.videoId,
    channelId: state.channelId,
    decision,
    controlMetrics: state.control,
    treatmentMetrics: state.treatment,
    loggedAt: decision.decidedAt,
  };
}

// ---------------------------------------------------------------------------
// WorkflowDefinition registration
// ---------------------------------------------------------------------------

/**
 * Input schema for the youtube_packaging_experiment workflow.
 * Stored as stepOutputs in the workflow_runs row.
 */
export const youtubePackagingExperimentInputSchema = z.object({
  experimentId: z.string().uuid(),
  videoId: z.string().min(1),
  channelId: z.string().min(1),
  /** ISO timestamp when the experiment was started. */
  startedAt: z.string().datetime(),
  /** ISO timestamp of last swap, or null. */
  lastSwapAt: z.string().datetime().nullable(),
  control: z.object({
    impressions: z.number().int().min(0),
    watchMinutes: z.number().min(0),
    avgViewDurationSeconds: z.number().min(0),
  }),
  treatment: z.object({
    impressions: z.number().int().min(0),
    watchMinutes: z.number().min(0),
    avgViewDurationSeconds: z.number().min(0),
  }),
  autoPublishEnabled: z.boolean(),
  config: z
    .object({
      minImpressionsPerVariant: z.number().int().positive().optional(),
      minTestDurationMs: z.number().positive().optional(),
      maxTestDurationMs: z.number().positive().optional(),
      minSwapCooldownMs: z.number().positive().optional(),
      winThreshold: z.number().min(0).max(1).optional(),
      loseThreshold: z.number().min(0).max(1).optional(),
      maxAvgViewDurationRegressionPct: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type YoutubePackagingExperimentInput = z.infer<
  typeof youtubePackagingExperimentInputSchema
>;

/**
 * Executor for the youtube_packaging_experiment workflow kind.
 *
 * This is a pure-logic evaluator — actual thumbnail swaps and metric fetches
 * are decoupled and delegated to the caller's connector layer (YouTube OAuth
 * connector, thumbnails.set API). The executor:
 *   1. Parses and validates the workflow_runs.stepOutputs input
 *   2. Calls evaluatePackagingExperiment
 *   3. Builds and returns a decision log entry
 *   4. Signals the desired action (swap / rollback / continue / approval) via stepOutputs
 *
 * DB/API side-effects (thumbnail swap, analytics fetch) are performed by the
 * cron processor after reading the completed workflow_run's stepOutputs. This
 * keeps the executor testable and avoids tying the workflow engine to
 * connector-specific API clients.
 */
async function executePackagingExperimentWorkflow(ctx: {
  workflowRunId: string;
  input: YoutubePackagingExperimentInput;
}): Promise<void> {
  // Dynamically import DB + helpers to keep this file importable in pure-logic
  // unit tests without mocking the entire DB layer.
  const { db } = await import('@/lib/db');
  const { workflowRuns } = await import('@/lib/db/schema/connectors');
  const { and, eq } = await import('drizzle-orm');
  const { captureError } = await import('@/lib/error-tracking');
  const { logger } = await import('@/lib/utils/logger');

  const { workflowRunId, input } = ctx;

  const state: ExperimentState = {
    experimentId: input.experimentId,
    videoId: input.videoId,
    channelId: input.channelId,
    startedAt: input.startedAt,
    lastSwapAt: input.lastSwapAt,
    control: input.control,
    treatment: input.treatment,
    autoPublishEnabled: input.autoPublishEnabled,
  };

  let decision: ExperimentDecision;
  try {
    decision = evaluatePackagingExperiment(state, input.config ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[packaging-experiment] evaluation failed', {
      workflowRunId,
      err,
    });
    await captureError('packaging-experiment evaluation failed', err, {
      workflowRunId,
    });
    await db
      .update(workflowRuns)
      .set({ status: 'failed', error: msg, updatedAt: new Date() })
      .where(
        and(
          eq(workflowRuns.id, workflowRunId),
          eq(workflowRuns.status, 'running')
        )
      );
    return;
  }

  const logEntry = buildDecisionLogEntry(state, decision);

  await db
    .update(workflowRuns)
    .set({
      status: 'completed',
      stepOutputs: {
        input,
        decision,
        logEntry,
      },
      shippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.status, 'running')
      )
    );

  logger.info('[packaging-experiment] decision recorded', {
    workflowRunId,
    experimentId: state.experimentId,
    videoId: state.videoId,
    decisionKind: decision.kind,
    prob: decision.probTreatmentWins,
  });
}

registerWorkflow({
  kind: YOUTUBE_PACKAGING_EXPERIMENT_KIND,
  description:
    'Sequential thumbnail swap experiment with Bayesian winner detection and rollback (JovieInc/Jovie#10919).',
  inputSchema: youtubePackagingExperimentInputSchema,
  requiredConnectors: ['youtube_oauth'],
  retryPolicy: DEFAULT_RETRY_POLICY,
  executor: executePackagingExperimentWorkflow,
});
