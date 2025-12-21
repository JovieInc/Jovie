import { desc, sql as drizzleSql } from 'drizzle-orm';
import { db, doesTableExist, waitlistEntries } from '@/lib/db';
import type { WaitlistEntry } from '@/lib/db/schema';

function isMissingWaitlistSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  const mentionsWaitlist = msg.includes('waitlist_entries');
  const missingTable =
    msg.includes('does not exist') ||
    msg.includes('undefined_table') ||
    msg.includes('relation');
  const missingColumn =
    msg.includes('column') && msg.includes('does not exist');
  const mentionsKnownNewColumns =
    msg.includes('primary_goal') || msg.includes('selected_plan');

  return (
    (mentionsWaitlist && (missingTable || missingColumn)) ||
    (mentionsWaitlist && mentionsKnownNewColumns)
  );
}

async function getAdminWaitlistEntriesFallback(params: {
  page: number;
  pageSize: number;
  offset: number;
}): Promise<GetAdminWaitlistResult> {
  try {
    const countResult = await db.execute(
      drizzleSql<{
        count: number;
      }>`SELECT count(*)::int AS count FROM waitlist_entries`
    );
    const total = Number(countResult.rows?.[0]?.count ?? 0);

    const result = await db.execute(
      drizzleSql`
        SELECT
          id,
          full_name,
          email,
          primary_social_url,
          primary_social_platform,
          primary_social_url_normalized,
          spotify_url,
          spotify_url_normalized,
          heard_about,
          status,
          primary_social_follower_count,
          created_at,
          updated_at
        FROM waitlist_entries
        ORDER BY created_at DESC
        LIMIT ${params.pageSize}
        OFFSET ${params.offset}
      `
    );

    const rawRows = result.rows ?? [];
    const entries: WaitlistEntryRow[] = rawRows.map(row => {
      const createdAtRaw = row.created_at;
      const updatedAtRaw = row.updated_at;

      return {
        id: String(row.id),
        fullName: String(row.full_name),
        email: String(row.email),
        primaryGoal: null,
        primarySocialUrl: String(row.primary_social_url),
        primarySocialPlatform: String(row.primary_social_platform),
        primarySocialUrlNormalized: String(row.primary_social_url_normalized),
        spotifyUrl: row.spotify_url != null ? String(row.spotify_url) : null,
        spotifyUrlNormalized:
          row.spotify_url_normalized != null
            ? String(row.spotify_url_normalized)
            : null,
        heardAbout: row.heard_about != null ? String(row.heard_about) : null,
        status: String(row.status) as WaitlistEntry['status'],
        primarySocialFollowerCount:
          row.primary_social_follower_count != null
            ? Number(row.primary_social_follower_count)
            : null,
        createdAt:
          createdAtRaw instanceof Date
            ? createdAtRaw
            : new Date(String(createdAtRaw)),
        updatedAt:
          updatedAtRaw instanceof Date
            ? updatedAtRaw
            : new Date(String(updatedAtRaw)),
      };
    });

    return {
      entries,
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  } catch {
    return {
      entries: [],
      page: params.page,
      pageSize: params.pageSize,
      total: 0,
    };
  }
}

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
  new: number;
  invited: number;
  claimed: number;
  rejected: number;
}

/**
 * Fetch waitlist metrics grouped by status
 */
export async function getWaitlistMetrics(): Promise<WaitlistMetrics> {
  const hasWaitlistTable = await doesTableExist('waitlist_entries');
  if (!hasWaitlistTable) {
    return { total: 0, new: 0, invited: 0, claimed: 0, rejected: 0 };
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
      new: 0,
      invited: 0,
      claimed: 0,
      rejected: 0,
    };

    for (const row of result) {
      const count = row.count ?? 0;
      metrics.total += count;
      if (row.status === 'new') metrics.new = count;
      else if (row.status === 'invited') metrics.invited = count;
      else if (row.status === 'claimed') metrics.claimed = count;
      else if (row.status === 'rejected') metrics.rejected = count;
    }

    return metrics;
  } catch (error) {
    if (isMissingWaitlistSchemaError(error)) {
      return { total: 0, new: 0, invited: 0, claimed: 0, rejected: 0 };
    }
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
    if (isMissingWaitlistSchemaError(error)) {
      return getAdminWaitlistEntriesFallback({ page, pageSize, offset });
    }
    throw error;
  }
}
