import { sql as drizzleSql } from 'drizzle-orm';
import { internalEmailSql } from '@/lib/accounts/internal-account';
import { users } from '@/lib/db/schema/auth';
import { waitlistEntries } from '@/lib/db/schema/waitlist';

/**
 * A waitlist row whose linked user existed long before the row did is a
 * backfill/migration of an existing account, not a person arriving. A real
 * signup creates the user and its waitlist row in the same moment.
 * Cohort review 2026-10-25: 52 of 53 7-day rows were one such batch
 * (2026-10-22T23:04:18Z), which would otherwise read as 52 signups.
 */
export const BACKFILL_MIN_USER_AGE_BEFORE_ENTRY = '1 day';

/**
 * SQL predicate for waitlist funnel and count metrics: the row is organic
 * (not a backfill of an older account). Rows with no linked user are organic.
 * Derived from provenance already stored, so it applies to past batches too.
 */
export function organicWaitlistEntrySql() {
  return drizzleSql`(NOT ${internalEmailSql(waitlistEntries.emailNormalized)} AND NOT EXISTS (
    SELECT 1 FROM ${users}
    WHERE ${users.waitlistEntryId} = ${waitlistEntries.id}
      AND ${users.createdAt} < ${waitlistEntries.createdAt} - interval '${drizzleSql.raw(BACKFILL_MIN_USER_AGE_BEFORE_ENTRY)}'
  ))`;
}
