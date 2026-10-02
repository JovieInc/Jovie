import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { logger } from '@/lib/utils/logger';

/**
 * User-less heartbeat for a reconciliation run.
 *
 * `billing_audit_log.user_id` is a required FK, so a run that fixes nobody
 * cannot write there. Health used to treat the latest audit row as "last
 * ran", which stays on the last fix (2026-07-27) even when the job is
 * executing. This key is the run, not the fix.
 */
export const BILLING_RECONCILIATION_LAST_RUN_KEY =
  'billing-reconciliation:last-run';

export interface BillingReconciliationRunReceipt {
  success: boolean;
  duration: number;
  stats: {
    usersChecked: number;
    mismatches: number;
    fixed: number;
    errors: number;
  };
}

export async function recordBillingReconciliationRun(
  result: BillingReconciliationRunReceipt
): Promise<void> {
  const now = new Date();
  const value = {
    ranAt: now.toISOString(),
    success: result.success,
    durationMs: result.duration,
    usersChecked: result.stats.usersChecked,
    mismatches: result.stats.mismatches,
    fixed: result.stats.fixed,
    errors: result.stats.errors,
  };

  try {
    await db
      .insert(ovieOperatingKv)
      .values({
        key: BILLING_RECONCILIATION_LAST_RUN_KEY,
        value,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ovieOperatingKv.key,
        set: { value, updatedAt: now },
      });
  } catch (error) {
    logger.warn('[billing-reconciliation] run receipt write failed', {
      error,
    });
  }
}

export async function readBillingReconciliationLastRunAt(): Promise<Date | null> {
  const rows = await db
    .select({ updatedAt: ovieOperatingKv.updatedAt })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, BILLING_RECONCILIATION_LAST_RUN_KEY));
  const updatedAt = rows[0]?.updatedAt;
  if (!updatedAt) return null;
  const parsed = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
