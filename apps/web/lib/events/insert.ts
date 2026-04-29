import { db } from '@/lib/db';
import {
  type ConfirmationStatus,
  type EventType,
  type NewTourDate,
  type TourDate,
  type TourDateProvider,
  tourDates,
} from '@/lib/db/schema/tour';

/**
 * Single insertion path for events. The `confirmationStatus` rule lives here
 * (not as a DB default) so it cannot be bypassed by a future migration that
 * sets a default and forgets the trust gate.
 *
 * NOTE on fan notifications: when a future code path fires fan notifications
 * on event creation/update, it must gate on
 * `confirmationStatus === 'confirmed' && eventType === 'tour'`. Pending,
 * rejected, and non-tour events MUST NOT trigger notifications in v1.
 */
export type InsertEventInput = Omit<
  NewTourDate,
  'confirmationStatus' | 'reviewedAt' | 'eventType' | 'provider'
> & {
  provider: TourDateProvider;
  eventType?: EventType;
};

export function deriveConfirmationStatus(
  provider: TourDateProvider
): ConfirmationStatus {
  return provider === 'manual' ? 'confirmed' : 'pending';
}

export async function insertEvent(input: InsertEventInput): Promise<TourDate> {
  const confirmationStatus = deriveConfirmationStatus(input.provider);
  const reviewedAt = confirmationStatus === 'confirmed' ? new Date() : null;
  const eventType = input.eventType ?? 'tour';

  const [row] = await db
    .insert(tourDates)
    .values({
      ...input,
      eventType,
      confirmationStatus,
      reviewedAt,
    })
    .returning();
  return row;
}

/**
 * Bulk insert for synced/imported events. All rows share the same provider —
 * use a separate call per provider. Rows go in as `pending` (manual is the
 * one provider that bypasses pending; if you have manual rows to bulk-insert,
 * they should not flow through this function).
 *
 * The conflict-update guard MUST omit `confirmationStatus` and `reviewedAt`
 * from the SET block so a re-sync from Bandsintown does not wipe out a
 * creator's confirm/reject decision.
 */
export async function bulkInsertSyncedEvents(
  rows: ReadonlyArray<InsertEventInput>
): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map(input => ({
    ...input,
    eventType: input.eventType ?? ('tour' as EventType),
    confirmationStatus: deriveConfirmationStatus(input.provider),
    reviewedAt:
      deriveConfirmationStatus(input.provider) === 'confirmed'
        ? new Date()
        : null,
  }));
  const inserted = await db.insert(tourDates).values(values).returning({
    id: tourDates.id,
  });
  return inserted.length;
}
