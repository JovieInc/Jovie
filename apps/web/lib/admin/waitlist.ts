import { desc, sql as drizzleSql } from 'drizzle-orm';
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
        drizzleSql`${waitlistEntries.waitlistEmailStatus} = 'error' OR ${waitlistEntries.inviteEmailStatus} = 'error'`
      );

    metrics.emailFailures = emailFailures?.count ?? 0;

    return metrics;
  } catch (error) {
    throw error;
  }
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
      .from(waitlistEntries);

    const total = countResult?.count ?? 0;

    // Get entries
    const entries = await db
      .select()
      .from(waitlistEntries)
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
