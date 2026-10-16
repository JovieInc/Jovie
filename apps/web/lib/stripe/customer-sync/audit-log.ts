/**
 * Customer Sync - Billing Audit Log Functions
 *
 * Functions for retrieving billing audit log entries.
 */

import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import type { DbOrTransaction } from '@/lib/db';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { captureCriticalError } from '@/lib/error-tracking';

const BILLING_HISTORY_ERROR = 'Unable to load billing history';

/**
 * Get billing audit log entries for a user.
 *
 * Retrieves historical billing state changes including subscription updates,
 * payment events, and reconciliation fixes. Useful for debugging billing
 * issues and providing transparency to users.
 *
 * @param limit - Maximum number of entries to return (default: 50)
 * @returns Promise with audit log entries sorted by most recent first
 *
 * @example
 * // Get recent billing history for a user
 * const result = await getBillingAuditLog(10);
 * if (result.success && result.data) {
 *   for (const entry of result.data) {
 *     console.log(`${entry.eventType} at ${entry.createdAt}`);
 *   }
 * }
 */
export async function getBillingAuditLog(
  limit = 50
): Promise<Awaited<ReturnType<typeof getBillingAuditLogForOwner>>> {
  try {
    return await withDbSessionTx((tx, appUserId) =>
      getBillingAuditLogForOwner(tx, appUserId, appUserId, limit)
    );
  } catch (error) {
    await captureCriticalError('Error getting billing audit log', error, {
      limit,
      function: 'getBillingAuditLog',
    });
    return { success: false, error: BILLING_HISTORY_ERROR };
  }
}

/**
 * Database-bound ownership seam used by the authenticated service and the
 * real-role parity suite. A caller cannot select a different tenant merely by
 * supplying another UUID, even when the database handle is privileged.
 */
export async function getBillingAuditLogForOwner(
  database: DbOrTransaction,
  authenticatedUserId: string,
  requestedUserId: string,
  limit = 50
): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    eventType: string;
    previousState: Record<string, unknown>;
    newState: Record<string, unknown>;
    stripeEventId: string | null;
    source: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>;
  error?: string;
}> {
  if (authenticatedUserId !== requestedUserId) {
    return { success: false, error: BILLING_HISTORY_ERROR };
  }

  try {
    const logs = await database
      .select({
        id: billingAuditLog.id,
        eventType: billingAuditLog.eventType,
        previousState: billingAuditLog.previousState,
        newState: billingAuditLog.newState,
        stripeEventId: billingAuditLog.stripeEventId,
        source: billingAuditLog.source,
        metadata: billingAuditLog.metadata,
        createdAt: billingAuditLog.createdAt,
      })
      .from(billingAuditLog)
      .where(
        and(
          eq(billingAuditLog.userId, authenticatedUserId),
          eq(billingAuditLog.userId, requestedUserId)
        )
      )
      .orderBy(drizzleSql`${billingAuditLog.createdAt} DESC`)
      .limit(limit);

    return {
      success: true,
      data: logs.map(log => ({
        ...log,
        previousState: log.previousState as Record<string, unknown>,
        newState: log.newState as Record<string, unknown>,
        metadata: log.metadata as Record<string, unknown>,
      })),
    };
  } catch (error) {
    await captureCriticalError('Error getting billing audit log', error, {
      limit,
      function: 'getBillingAuditLogForOwner',
    });
    return { success: false, error: BILLING_HISTORY_ERROR };
  }
}
