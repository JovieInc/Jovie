import type { ReconciliationStats } from '@/lib/billing/reconciliation/batch-processor';
import { RECONCILIATION_RUN_EVENT } from '@/lib/billing/sync-remediation-policy';
import { db } from '@/lib/db';
import { billingAuditLog } from '@/lib/db/schema/billing';

export interface ReconciliationReplaySummary {
  processed: number;
  blocked: number;
  failed: number;
}

/**
 * Record that a reconciliation pass finished with no processing errors.
 *
 * Billing health reads the newest `source = reconciliation` audit row. Fix
 * rows are written only when a user is repaired, so a quiet day used to look
 * like a dead cron. This system row is the run heartbeat.
 */
export async function recordReconciliationHeartbeat(input: {
  stats: ReconciliationStats;
  durationMs: number;
  replay: ReconciliationReplaySummary;
}): Promise<void> {
  await db.insert(billingAuditLog).values({
    userId: null,
    eventType: RECONCILIATION_RUN_EVENT,
    previousState: {},
    newState: {
      usersChecked: input.stats.usersChecked,
      mismatches: input.stats.mismatches,
      fixed: input.stats.fixed,
      errors: input.stats.errors,
    },
    source: 'reconciliation',
    metadata: {
      heartbeat: true,
      durationMs: input.durationMs,
      replay: input.replay,
    },
  });
}
