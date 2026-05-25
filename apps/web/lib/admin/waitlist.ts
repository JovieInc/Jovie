import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db, doesTableExist } from '@/lib/db';
import { type WaitlistEntry, waitlistEntries } from '@/lib/db/schema/waitlist';

export interface WaitlistEntryRow {
  id: string;
  fullName: string;
  email: string;
  primaryGoal: string | null;
  primarySocialUrl: string;
  primarySocialPlatform: string;
  primarySocialUrlNormalized: string;
  spotifyUrl: string | null;
  spotifyUrlNormalized: string | null;
  spotifyArtistName: string | null;
  heardAbout: string | null;
  status: WaitlistEntry['status'];
  primarySocialFollowerCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetAdminWaitlistParams {
  page?: number;
  pageSize?: number;
}

export interface GetAdminWaitlistResult {
  entries: WaitlistEntryRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface WaitlistMetrics {
  total: number;
  waitlisted: number;
  invited: number;
  signedUp: number;
  emailFailures: number;
}

export interface WaitlistIntegritySummary {
  usersMissingWaitlistEntry: number;
  entriesMissingUser: number;
  signedUpEntriesMissingUser: number;
  totalIssues: number;
}

interface WaitlistIntegrityRawRow {
  users_missing_waitlist_entry?: number | string | null;
  entries_missing_user?: number | string | null;
  signed_up_entries_missing_user?: number | string | null;
}

const EMPTY_WAITLIST_INTEGRITY: WaitlistIntegritySummary = {
  usersMissingWaitlistEntry: 0,
  entriesMissingUser: 0,
  signedUpEntriesMissingUser: 0,
  totalIssues: 0,
};

function getRawRows(result: unknown): Record<string, unknown>[] {
  return (result as { rows?: Record<string, unknown>[] }).rows ?? [];
}

function toCount(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Fetch waitlist metrics grouped by status
 */
export async function getWaitlistMetrics(): Promise<WaitlistMetrics> {
  const hasWaitlistTable = await doesTableExist('waitlist_entries');
  if (!hasWaitlistTable) {
    return {
      total: 0,
      waitlisted: 0,
      invited: 0,
      signedUp: 0,
      emailFailures: 0,
    };
  }

  try {
    const result = await db
      .select({
        status: waitlistEntries.status,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.canonical, true))
      .groupBy(waitlistEntries.status);

    const metrics: WaitlistMetrics = {
      total: 0,
      waitlisted: 0,
      invited: 0,
      signedUp: 0,
      emailFailures: 0,
    };

    for (const row of result) {
      const count = row.count ?? 0;
      metrics.total += count;
      if (
        row.status === 'new' ||
        row.status === 'chat_started' ||
        row.status === 'qualified' ||
        row.status === 'waitlisted'
      ) {
        metrics.waitlisted += count;
      } else if (row.status === 'invited' || row.status === 'approved') {
        metrics.invited += count;
      } else if (row.status === 'claimed' || row.status === 'signed_up') {
        metrics.signedUp += count;
      }
    }

    const [emailFailures] = await db
      .select({
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.canonical, true),
          drizzleSql`${waitlistEntries.waitlistEmailStatus} = 'error' OR ${waitlistEntries.inviteEmailStatus} = 'error'`
        )
      );

    metrics.emailFailures = emailFailures?.count ?? 0;

    return metrics;
  } catch (error) {
    throw error;
  }
}

export async function getWaitlistIntegritySummary(): Promise<WaitlistIntegritySummary> {
  const hasWaitlistTable = await doesTableExist('waitlist_entries');
  if (!hasWaitlistTable) {
    return EMPTY_WAITLIST_INTEGRITY;
  }

  const result = await db.execute(drizzleSql<WaitlistIntegrityRawRow>`
    WITH users_missing_waitlist_entry AS (
      SELECT COUNT(*)::int AS count
      FROM users u
      LEFT JOIN waitlist_entries by_id
        ON by_id.id = u.waitlist_entry_id
      LEFT JOIN waitlist_entries by_email
        ON by_email.canonical = true
        AND u.email IS NOT NULL
        AND (
          by_email.email_normalized = lower(u.email)
          OR lower(by_email.email) = lower(u.email)
        )
      WHERE u.deleted_at IS NULL
        AND u.user_status IN ('waitlist_pending', 'waitlist_approved')
        AND by_id.id IS NULL
        AND by_email.id IS NULL
    ),
    entries_missing_user AS (
      SELECT COUNT(*)::int AS count
      FROM waitlist_entries w
      LEFT JOIN users by_id
        ON by_id.waitlist_entry_id = w.id
        AND by_id.deleted_at IS NULL
      LEFT JOIN users by_email
        ON by_email.deleted_at IS NULL
        AND by_email.email IS NOT NULL
        AND lower(by_email.email) = w.email_normalized
      WHERE w.canonical = true
        AND w.status IN ('approved', 'invited', 'claimed', 'signed_up')
        AND by_id.id IS NULL
        AND by_email.id IS NULL
    ),
    signed_up_entries_missing_user AS (
      SELECT COUNT(*)::int AS count
      FROM waitlist_entries w
      LEFT JOIN users by_id
        ON by_id.waitlist_entry_id = w.id
        AND by_id.deleted_at IS NULL
      LEFT JOIN users by_email
        ON by_email.deleted_at IS NULL
        AND by_email.email IS NOT NULL
        AND lower(by_email.email) = w.email_normalized
      WHERE w.canonical = true
        AND w.status = 'signed_up'
        AND by_id.id IS NULL
        AND by_email.id IS NULL
    )
    SELECT
      (SELECT count FROM users_missing_waitlist_entry) AS users_missing_waitlist_entry,
      (SELECT count FROM entries_missing_user) AS entries_missing_user,
      (SELECT count FROM signed_up_entries_missing_user) AS signed_up_entries_missing_user
  `);
  const [raw] = getRawRows(result) as WaitlistIntegrityRawRow[];
  const usersMissingWaitlistEntry = toCount(raw?.users_missing_waitlist_entry);
  const entriesMissingUser = toCount(raw?.entries_missing_user);
  const signedUpEntriesMissingUser = toCount(
    raw?.signed_up_entries_missing_user
  );

  return {
    usersMissingWaitlistEntry,
    entriesMissingUser,
    signedUpEntriesMissingUser,
    totalIssues:
      usersMissingWaitlistEntry +
      entriesMissingUser +
      signedUpEntriesMissingUser,
  };
}

/**
 * Fetch waitlist entries for admin panel
 * Sorted by createdAt DESC with pagination
 */
export async function getAdminWaitlistEntries(
  params: GetAdminWaitlistParams = {}
): Promise<GetAdminWaitlistResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const hasWaitlistTable = await doesTableExist('waitlist_entries');
  if (!hasWaitlistTable) {
    return {
      entries: [],
      page,
      pageSize,
      total: 0,
    };
  }

  try {
    // Get total count
    const [countResult] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.canonical, true));

    const total = countResult?.count ?? 0;

    // Get entries
    const entries = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.canonical, true))
      .orderBy(desc(waitlistEntries.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      entries: entries.map(entry => ({
        id: entry.id,
        fullName: entry.fullName,
        email: entry.email,
        primaryGoal: entry.primaryGoal,
        primarySocialUrl: entry.primarySocialUrl,
        primarySocialPlatform: entry.primarySocialPlatform,
        primarySocialUrlNormalized: entry.primarySocialUrlNormalized,
        spotifyUrl: entry.spotifyUrl,
        spotifyUrlNormalized: entry.spotifyUrlNormalized,
        spotifyArtistName: entry.spotifyArtistName ?? null,
        heardAbout: entry.heardAbout,
        status: entry.status,
        primarySocialFollowerCount: entry.primarySocialFollowerCount,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
      page,
      pageSize,
      total,
    };
  } catch (error) {
    throw error;
  }
}
