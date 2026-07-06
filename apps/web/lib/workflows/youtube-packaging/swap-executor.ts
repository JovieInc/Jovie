/**
 * Workflow executor: packaging_swap_experiment (JovieInc/Jovie#10919)
 *
 * Sequential thumbnail swap experiment engine. Registered as a WorkflowDefinition
 * in the process-workflow-runs cron dispatcher.
 *
 * State machine:
 *   queued → running (claimed by cron)
 *   running → phase=initializing  (treatment thumbnail not yet available)
 *   running → phase=running       (treatment thumbnail active, accumulating metrics)
 *   running → phase=decided       (winner selected; swap/rollback executed or pending approval)
 *   running → completed / waiting_for_approval / failed
 *
 * Invariants:
 * - Auto-swap ONLY when stepOutputs.autoPublishEnabled = true
 * - Decision log is append-only (immutable provenance)
 * - Bayesian winner requires checkGuardrails() + selectWinner() both passing
 * - Rollback: if control wins, treatment thumbnail is swapped back
 * - v1: thumbnail swap/rollback is stubbed (YouTube Data API connector TBD)
 *
 * BlockedBy: YouTube OAuth connector (#10919 note), thumbnail generator, policy gate.
 * The stub preserves the full decision flow and audit trail so the live connector
 * can be wired in by updating stubExecuteThumbnailSwap().
 */

import { and, eq } from 'drizzle-orm';
import { markWorkflowFailed } from '@/lib/connectors/workflows/execute-approved-action';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { checkGuardrails, selectWinner } from './bayesian';
import type {
  DecisionLogEntry,
  DecisionOutcome,
  PackagingSwapExperimentStepOutputs,
  VariantMetrics,
} from './types';
import { PACKAGING_SWAP_EXPERIMENT_WORKFLOW_KIND } from './types';

// ---------------------------------------------------------------------------
// Thumbnail swap stub (v1 — real YouTube Data API connector TBD)
// ---------------------------------------------------------------------------

/**
 * Executes a thumbnail swap on YouTube (stub implementation).
 *
 * In production this will call the YouTube Data API thumbnails.set endpoint
 * via the channel's OAuth connector. Until the connector is built, this
 * function logs the intent and succeeds so the rest of the decision flow
 * (audit log, outcome attribution, learning layer) runs end-to-end.
 *
 * ponytail: stub logs action, real connector replaces this function body.
 */
async function stubExecuteThumbnailSwap(opts: {
  readonly videoId: string;
  readonly channelId: string;
  readonly thumbnailUrl: string;
  readonly action: 'apply_treatment' | 'rollback_to_control';
}): Promise<void> {
  logger.info(
    '[packaging-swap-experiment] STUB thumbnail swap (connector not yet wired)',
    {
      videoId: opts.videoId,
      channelId: opts.channelId,
      action: opts.action,
      thumbnailUrl: opts.thumbnailUrl,
    }
  );
  // Real implementation: await youtubeConnector.setThumbnail(opts)
}

// ---------------------------------------------------------------------------
// Decision log helpers
// ---------------------------------------------------------------------------

function buildDecisionEntry(
  outcome: DecisionOutcome,
  reason: string,
  metrics?: {
    confidence: number | null;
    controlRate: number | null;
    treatmentRate: number | null;
  }
): DecisionLogEntry {
  return {
    decidedAt: new Date().toISOString(),
    outcome,
    confidence: metrics?.confidence ?? null,
    controlRate: metrics?.controlRate ?? null,
    treatmentRate: metrics?.treatmentRate ?? null,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Stub: fetch current variant metrics from YouTube Analytics connector
// ---------------------------------------------------------------------------

/**
 * Returns current metrics for the control and treatment variants.
 *
 * v1 stub: reads from existing stepOutputs (metrics populated externally
 * by the YouTube Analytics ingestion job — not yet built). Returns null
 * when metrics are not yet available so the run stays in 'running' phase.
 *
 * ponytail: real connector replaces this; stub keeps the flow compilable.
 */
async function fetchVariantMetrics(
  stepOutputs: PackagingSwapExperimentStepOutputs
): Promise<{
  control: VariantMetrics | null;
  treatment: VariantMetrics | null;
}> {
  // In v1, metrics are injected into stepOutputs by an external ingestion job.
  // The executor just reads whatever is there.
  return {
    control: stepOutputs.control,
    treatment: stepOutputs.treatment,
  };
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

interface ExecutePackagingSwapExperimentInput {
  readonly workflowRunId: string;
}

/**
 * Execute one tick of a packaging_swap_experiment workflow_run.
 *
 * This function is idempotent and designed to be called repeatedly by the
 * cron until the experiment reaches a terminal phase ('decided' or 'failed').
 *
 * Each invocation:
 * 1. Loads the run and validates kind + phase
 * 2. Fetches latest variant metrics
 * 3. Checks guardrails
 * 4. If guardrails pass, selects winner
 * 5. Executes swap/rollback (stub) or parks for approval
 * 6. Appends to decision log and transitions to terminal state
 */
export async function executePackagingSwapExperiment(
  input: ExecutePackagingSwapExperimentInput
): Promise<void> {
  const { workflowRunId } = input;

  // 1. Load the run
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, workflowRunId),
        eq(workflowRuns.status, 'running'),
        eq(workflowRuns.kind, PACKAGING_SWAP_EXPERIMENT_WORKFLOW_KIND)
      )
    )
    .limit(1);

  if (!run) {
    logger.warn('[packaging-swap-experiment] run not found or not running', {
      workflowRunId,
    });
    return;
  }

  const stepOutputs =
    run.stepOutputs as PackagingSwapExperimentStepOutputs | null;

  if (!stepOutputs?.videoId || !stepOutputs?.channelId) {
    await markWorkflowFailed(
      workflowRunId,
      'stepOutputs missing videoId or channelId'
    );
    return;
  }

  // 2. Already decided — idempotent no-op (cron may pick this up before
  //    the terminal status is written; the CAS below guards the transition)
  if (stepOutputs.phase === 'decided' || stepOutputs.phase === 'failed') {
    logger.info('[packaging-swap-experiment] run already in terminal phase', {
      workflowRunId,
      phase: stepOutputs.phase,
    });
    return;
  }

  try {
    // 3. Fetch latest metrics
    const { control, treatment } = await fetchVariantMetrics(stepOutputs);

    // Phase: initializing — treatment thumbnail not yet available
    if (!control || !treatment) {
      logger.info(
        '[packaging-swap-experiment] metrics not yet available; staying in initializing',
        { workflowRunId, hasControl: !!control, hasTreatment: !!treatment }
      );
      // Re-queue for next cron tick — do not advance phase
      await db
        .update(workflowRuns)
        .set({
          status: 'queued',
          runAt: new Date(Date.now() + 6 * 60 * 1000), // retry in 6 min
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowRuns.id, workflowRunId),
            eq(workflowRuns.status, 'running')
          )
        );
      return;
    }

    // 4. Guardrail evaluation
    const guardrail = checkGuardrails(control, treatment, {
      minImpressionsPerVariant: stepOutputs.minImpressionsPerVariant,
      minExperimentDurationHours: stepOutputs.minExperimentDurationHours,
      lastSwappedAt: stepOutputs.lastSwappedAt,
    });

    if (!guardrail.passed) {
      logger.info('[packaging-swap-experiment] guardrail not met; re-queuing', {
        workflowRunId,
        reason: guardrail.reason,
      });
      // Stay in running phase; re-queue for next tick
      await db
        .update(workflowRuns)
        .set({
          status: 'queued',
          runAt: new Date(Date.now() + 6 * 60 * 1000),
          updatedAt: new Date(),
          stepOutputs: {
            ...stepOutputs,
            phase: 'running',
            control,
            treatment,
          } as Record<string, unknown>,
        })
        .where(
          and(
            eq(workflowRuns.id, workflowRunId),
            eq(workflowRuns.status, 'running')
          )
        );
      return;
    }

    // 5. Select winner
    const decision = selectWinner(
      control,
      treatment,
      stepOutputs.minBayesianConfidence
    );

    const logEntry = buildDecisionEntry(
      decision.winner === 'treatment'
        ? 'treatment_wins'
        : decision.winner === 'control'
          ? 'control_wins'
          : 'inconclusive',
      decision.reason,
      {
        confidence: decision.confidence,
        controlRate: decision.controlRate,
        treatmentRate: decision.treatmentRate,
      }
    );

    logger.info('[packaging-swap-experiment] winner selected', {
      workflowRunId,
      winner: decision.winner,
      confidence: decision.confidence,
    });

    // 6. Auto-swap gate
    if (!stepOutputs.autoPublishEnabled) {
      // Park for human approval — do not swap
      const approvalEntry = buildDecisionEntry(
        'waiting_for_approval',
        'autoPublishEnabled=false; human approval required before swap',
        {
          confidence: decision.confidence,
          controlRate: decision.controlRate,
          treatmentRate: decision.treatmentRate,
        }
      );
      const updatedLog = [...stepOutputs.decisionLog, logEntry, approvalEntry];

      await db
        .update(workflowRuns)
        .set({
          status: 'waiting_for_approval',
          updatedAt: new Date(),
          stepOutputs: {
            ...stepOutputs,
            phase: 'decided',
            control,
            treatment,
            winner: decision.winner,
            decisionLog: updatedLog,
          } as Record<string, unknown>,
        })
        .where(
          and(
            eq(workflowRuns.id, workflowRunId),
            eq(workflowRuns.status, 'running')
          )
        );

      logger.info('[packaging-swap-experiment] parked for approval', {
        workflowRunId,
        winner: decision.winner,
      });
      return;
    }

    // 7. Execute swap or rollback
    const now = new Date().toISOString();
    let swapEntry: DecisionLogEntry;

    if (decision.winner === 'treatment' && stepOutputs.treatmentThumbnailUrl) {
      await stubExecuteThumbnailSwap({
        videoId: stepOutputs.videoId,
        channelId: stepOutputs.channelId,
        thumbnailUrl: stepOutputs.treatmentThumbnailUrl,
        action: 'apply_treatment',
      });
      swapEntry = buildDecisionEntry(
        'swap_executed',
        'Treatment thumbnail applied (auto-publish)',
        {
          confidence: decision.confidence,
          controlRate: decision.controlRate,
          treatmentRate: decision.treatmentRate,
        }
      );
    } else {
      // Control wins or inconclusive — rollback to control thumbnail
      await stubExecuteThumbnailSwap({
        videoId: stepOutputs.videoId,
        channelId: stepOutputs.channelId,
        thumbnailUrl: stepOutputs.treatmentThumbnailUrl ?? '',
        action: 'rollback_to_control',
      });
      swapEntry = buildDecisionEntry(
        'rollback_executed',
        'Control retained / treatment rolled back',
        {
          confidence: decision.confidence,
          controlRate: decision.controlRate,
          treatmentRate: decision.treatmentRate,
        }
      );
    }

    const finalLog = [...stepOutputs.decisionLog, logEntry, swapEntry];

    // 8. CAS: running → completed
    await db
      .update(workflowRuns)
      .set({
        status: 'completed',
        shippedAt: new Date(),
        updatedAt: new Date(),
        stepOutputs: {
          ...stepOutputs,
          phase: 'decided',
          control,
          treatment,
          winner: decision.winner,
          lastSwappedAt: now,
          decisionLog: finalLog,
        } as Record<string, unknown>,
      })
      .where(
        and(
          eq(workflowRuns.id, workflowRunId),
          eq(workflowRuns.status, 'running')
        )
      );

    logger.info('[packaging-swap-experiment] experiment complete', {
      workflowRunId,
      winner: decision.winner,
      confidence: decision.confidence,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[packaging-swap-experiment] executor threw unexpectedly', {
      workflowRunId,
      err,
    });
    await captureError('packaging-swap-experiment failed', err, {
      workflowRunId,
    });
    await markWorkflowFailed(workflowRunId, errorMessage);
  }
}
