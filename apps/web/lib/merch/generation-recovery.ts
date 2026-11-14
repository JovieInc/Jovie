import 'server-only';

/**
 * Merch generation reconciler (PR-4): the fail-safe that guarantees merch
 * generation always reaches a TERMINAL state, even when the request-scoped
 * worker was cut off (function budget, deploy, crash).
 *
 * - Options stuck in `pending_mockup` past the stale window are failed
 *   (`mockup_failed`, reason `enrichment_timeout`) via a CONDITIONAL update
 *   that still requires `pending_mockup` — a late enrichment success is
 *   never clobbered.
 * - Batches stuck in `generating` past the same window are marked `failed`.
 * - Both repairs are single bounded statements (LIMIT inside the id
 *   subselect) and idempotent: a second run matches zero rows.
 * - Repairs emit a warning-level receipt with counts through the capture
 *   helper (console + analytics; the production logger is a no-op, so the
 *   capture helper is the observable record). The Sentry filing for this
 *   designed-path receipt is intentionally dropped (JOV-12581): a
 *   successful reconciliation is the fail-safe working, not an error.
 */

import { and, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  merchDesignOptions,
  merchGenerationBatches,
} from '@/lib/db/schema/merch';
import { captureWarning } from '@/lib/error-tracking';

/** Minutes without progress before pending generation work is declared dead. */
export const MERCH_GENERATION_STALE_MINUTES = 15;
/** Max rows repaired per table per tick. */
export const MERCH_RECOVERY_BATCH_SIZE = 25;

/** Reason stamped on options the reconciler failed after an enrichment stall. */
export const MERCH_MOCKUP_TIMEOUT_REASON = 'enrichment_timeout';
/** Reason stamped on batches the reconciler failed after a generation stall. */
export const MERCH_BATCH_TIMEOUT_REASON = 'generation_timeout';

export interface MerchGenerationRecoveryResult {
  readonly staleMockupsFailed: number;
  readonly staleBatchesFailed: number;
  readonly recoveredAt: string;
}

/**
 * Fails design options whose mockup enrichment has been pending past the
 * stale window. The outer `pending_mockup` predicate is the race guard: only
 * rows STILL pending are failed, so a late enrichment success between ticks
 * is never overwritten.
 */
async function failStaleMockupPendingOptions(now: Date): Promise<number> {
  const cutoff = new Date(
    now.getTime() - MERCH_GENERATION_STALE_MINUTES * 60_000
  );
  const patch = {
    mockupStatus: 'mockup_failed',
    mockupError: MERCH_MOCKUP_TIMEOUT_REASON,
    mockupCompletedAt: now.toISOString(),
  };
  const updated = await db
    .update(merchDesignOptions)
    .set({
      qualityReview: drizzleSql`coalesce(${merchDesignOptions.qualityReview}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: now,
    })
    .where(
      and(
        drizzleSql`${merchDesignOptions.id} in (
          select ${merchDesignOptions.id} from ${merchDesignOptions}
          where ${merchDesignOptions.qualityReview} ->> 'mockupStatus' = 'pending_mockup'
            and ${merchDesignOptions.updatedAt} < ${cutoff}
          limit ${MERCH_RECOVERY_BATCH_SIZE}
        )`,
        drizzleSql`${merchDesignOptions.qualityReview} ->> 'mockupStatus' = 'pending_mockup'`
      )
    )
    .returning({ id: merchDesignOptions.id });
  return updated.length;
}

/** Fails generation batches stuck in `generating` past the stale window. */
async function failStaleGenerationBatches(now: Date): Promise<number> {
  const cutoff = new Date(
    now.getTime() - MERCH_GENERATION_STALE_MINUTES * 60_000
  );
  const updated = await db
    .update(merchGenerationBatches)
    .set({
      status: 'failed',
      error: MERCH_BATCH_TIMEOUT_REASON,
      completedAt: now,
    })
    .where(
      and(
        drizzleSql`${merchGenerationBatches.id} in (
          select ${merchGenerationBatches.id} from ${merchGenerationBatches}
          where ${merchGenerationBatches.status} = 'generating'
            and ${merchGenerationBatches.createdAt} < ${cutoff}
          limit ${MERCH_RECOVERY_BATCH_SIZE}
        )`,
        drizzleSql`${merchGenerationBatches.status} = 'generating'`
      )
    )
    .returning({ id: merchGenerationBatches.id });
  return updated.length;
}

/**
 * One reconciliation pass over merch generation state. Runs inside the
 * queue-tick cron; never throws into the tick fan-out for anything but a
 * real DB failure.
 */
export async function reconcileMerchGeneration(
  now: Date = new Date()
): Promise<MerchGenerationRecoveryResult> {
  const staleMockupsFailed = await failStaleMockupPendingOptions(now);
  const staleBatchesFailed = await failStaleGenerationBatches(now);
  if (staleMockupsFailed > 0 || staleBatchesFailed > 0) {
    await captureWarning(
      '[merch-generation-recovery] reconciled stale merch generation work',
      undefined,
      { staleMockupsFailed, staleBatchesFailed }
    );
  }
  return {
    staleMockupsFailed,
    staleBatchesFailed,
    recoveredAt: now.toISOString(),
  };
}
