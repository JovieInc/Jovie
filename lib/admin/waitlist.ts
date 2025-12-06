import { desc, sql as drizzleSql } from 'drizzle-orm';
import { db, waitlistEntries } from '@/lib/db';
import type { WaitlistEntry } from '@/lib/db/schema';

export interface WaitlistEntryRow {
  id: string;
  fullName: string;
  email: string;
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
}
