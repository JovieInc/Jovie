import 'server-only';

/**
 * Win-back approval ledger + the 14-day budget read (founder dispatch
 * 2026-11-09). The approval record (`jovie.winback-approval/v1` — approved
 * template version + admin-approved batch containing exact entry ids) is
 * the ONLY thing that can authorize a win-back send; it lives in the Ovie
 * operating ledger next to the outbound-type state. The batch-promotion
 * path is NOT wired to any route or button.
 */

import { and, desc, sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import {
  WINBACK_EMAIL_TEMPLATE_VERSION,
  type WinbackApprovalRecord,
  winbackApprovalKvKey,
  winbackApprovalRecordSchema,
  winbackSendApprovalError,
} from '@/lib/waitlist/winback';
import { trackWinbackEvent } from '@/lib/waitlist/winback-analytics';
import { readKvJson } from '@/lib/waitlist/winback-signals.server';

export async function saveWinbackApprovalRecord(
  tx: DbOrTransaction,
  record: WinbackApprovalRecord
): Promise<void> {
  const error = winbackSendApprovalError(record, {
    batchId: record.batchId,
    templateVersion: record.templateVersion,
    entryId: record.entryIds[0],
  });
  if (error) throw new Error(`Invalid winback approval record: ${error}`);
  const now = new Date();
  await tx
    .insert(ovieOperatingKv)
    .values({
      key: winbackApprovalKvKey(record.batchId),
      value: record,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ovieOperatingKv.key,
      set: { value: record, updatedAt: now },
    });
}

export async function getWinbackApprovalRecord(
  tx: DbOrTransaction,
  batchId: string
): Promise<unknown> {
  return readKvJson(tx, winbackApprovalKvKey(batchId));
}

/**
 * Promote a batch's held drafts to sendable (`pending`) — only when a valid
 * approval record exists. Not wired to any route or button: the operator
 * path lands with Tim's approval of the template and the first batch.
 */
export async function promoteApprovedWinbackBatch(
  tx: DbOrTransaction,
  batchId: string
): Promise<{ promoted: number }> {
  const approval = await getWinbackApprovalRecord(tx, batchId);
  const record = winbackApprovalRecordSchema.safeParse(approval);
  if (
    !record.success ||
    record.data.templateVersion !== WINBACK_EMAIL_TEMPLATE_VERSION
  ) {
    throw new Error(
      `winback batch ${batchId} has no valid approval record; nothing promoted`
    );
  }

  const held = await tx
    .select({ id: ingestionJobs.id, payload: ingestionJobs.payload })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.jobType, 'send_waitlist_winback_email'),
        eq(ingestionJobs.status, 'held_for_approval'),
        drizzleSql`${ingestionJobs.payload}->>'batchId' = ${batchId}`
      )
    );

  const approvedEntryIds = new Set(record.data.entryIds);
  const promotable = held
    .filter(
      row =>
        (row.payload as Record<string, unknown>).type ===
          'winback_capability_shipped' &&
        approvedEntryIds.has(
          String((row.payload as Record<string, unknown>).entryId)
        )
    )
    .map(row => row.id);
  if (promotable.length === 0) return { promoted: 0 };

  const promoted = await tx
    .update(ingestionJobs)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(inArray(ingestionJobs.id, promotable))
    .returning({ id: ingestionJobs.id });

  await trackWinbackEvent('winback_approved', {
    batch_id: batchId,
    capability_key: record.data.capabilityKey,
    template_version: record.data.templateVersion,
    winback_cohort: 'approved',
  });
  return { promoted: promoted.length };
}

const WINBACK_REPLY_EVENTS = [
  'winback_opened',
  'winback_clicked',
  'returned',
] as const;

export async function getLastUnansweredWinbackSentAt(
  tx: DbOrTransaction,
  entryId: string
): Promise<Date | null> {
  const [lastSent] = await tx
    .select({ occurredAt: serverAnalyticsEvents.occurredAt })
    .from(serverAnalyticsEvents)
    .where(
      and(
        eq(serverAnalyticsEvents.eventName, 'winback_sent'),
        drizzleSql`${serverAnalyticsEvents.properties}->>'entry_id' = ${entryId}`
      )
    )
    .orderBy(desc(serverAnalyticsEvents.occurredAt))
    .limit(1);
  if (!lastSent) return null;

  const [lastReply] = await tx
    .select({ occurredAt: serverAnalyticsEvents.occurredAt })
    .from(serverAnalyticsEvents)
    .where(
      and(
        inArray(serverAnalyticsEvents.eventName, [...WINBACK_REPLY_EVENTS]),
        drizzleSql`${serverAnalyticsEvents.properties}->>'entry_id' = ${entryId}`,
        drizzleSql`${serverAnalyticsEvents.occurredAt} > ${lastSent.occurredAt.toISOString()}`
      )
    )
    .orderBy(desc(serverAnalyticsEvents.occurredAt))
    .limit(1);

  if (lastReply && lastReply.occurredAt > lastSent.occurredAt) return null;
  return lastSent.occurredAt;
}
