import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { normalizeEmail } from '@/lib/utils/email';
import type { WaitlistStatus as CanonicalWaitlistStatus } from '@/lib/waitlist/state-machine';

export type WaitlistStatus = CanonicalWaitlistStatus;

export interface WaitlistAccessResult {
  entryId: string | null;
  status: WaitlistStatus | null;
}

/**
 * Check waitlist access by email.
 * Returns the waitlist entry status.
 *
 * Shared by gate.ts and provision.ts so Better Auth provisioning does not
 * import the session gate (and create an import cycle).
 */
export async function getWaitlistAccess(
  email: string
): Promise<WaitlistAccessResult> {
  const normalizedEmail = normalizeEmail(email);

  // JOV-1963: order by createdAt DESC so the LATEST waitlist entry wins when
  // a single email has multiple entries. Previously the query relied on
  // arbitrary ordering, which could surface a stale `'new'` row even after
  // the user had been invited or claimed access.
  const [entry] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(
      drizzleSql`${waitlistEntries.emailNormalized} = ${normalizedEmail} OR lower(${waitlistEntries.email}) = ${normalizedEmail}`
    )
    .orderBy(
      drizzleSql`${waitlistEntries.canonical} DESC, ${waitlistEntries.createdAt} DESC`
    )
    .limit(1);

  if (!entry) {
    return { entryId: null, status: null };
  }

  return {
    entryId: entry.id,
    status: entry.status,
  };
}
