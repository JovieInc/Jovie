/**
 * Customer Sync - Billing Audit Log Functions
 *
 * Functions for retrieving billing audit log entries.
 */

import 'server-only';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingAuditLog } from '@/lib/db/schema/billing';
import { captureCriticalError } from '@/lib/error-tracking';

/**
 * Get billing audit log entries for a user.
 *
 * Retrieves historical billing state changes including subscription updates,
 * payment events, and reconciliation fixes. Useful for debugging billing
 * issues and providing transparency to users.
 *
 * @param userId - The internal database user ID (not Clerk ID)
 * @param limit - Maximum number of entries to return (default: 50)
 * @returns Promise with audit log entries sorted by most recent first
 *
 * @example
 * // Get recent billing history for a user
 * const result = await getBillingAuditLog(userId, 10);
 * if (result.success && result.data) {
 *   for (const entry of result.data) {
 *     console.log(`${entry.eventType} at ${entry.createdAt}`);
 *   }
 * }
 */
export async function getBillingAuditLog(
  userId: string,
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
    createdAt: Date;
  }>;
  error?: string;
}> {
  try {
    const logs = await db
      .select({
        id: billingAuditLog.id,
        eventType: billingAuditLog.eventType,
        previousState: billingAuditLog.previousState,
        newState: billingAuditLog.newState,
        stripeEventId: billingAuditLog.stripeEventId,
        source: billingAuditLog.source,
        createdAt: billingAuditLog.createdAt,
      })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.userId, userId))
      .orderBy(drizzleSql`${billingAuditLog.createdAt} DESC`)
      .limit(limit);

    return {
      success: true,
      data: logs.map(log => ({
        ...log,
        previousState: log.previousState as Record<string, unknown>,
        newState: log.newState as Record<string, unknown>,
      })),
    };
  } catch (error) {
    await captureCriticalError('Error getting billing audit log', error, {
      userId,
      limit,
      function: 'getBillingAuditLog',
    });
    return { success: false, error: 'Failed to retrieve audit log' };
  }
}
