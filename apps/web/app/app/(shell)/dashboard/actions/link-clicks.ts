'use server';

import { sql as drizzleSql } from 'drizzle-orm';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { clickEvents } from '@/lib/db/schema/analytics';
import { socialLinks } from '@/lib/db/schema/links';

export interface LinkClickStat {
  platform: string;
  clicks: number;
}

/**
 * Get link click counts grouped by platform for the last 30 days.
 * Joins click_events with social_links to resolve platform names.
 */
export async function getLinkClicksByPlatform(
  clerkUserId: string
): Promise<{ stats: LinkClickStat[]; total: number }> {
  const { profile } = await getSessionContext({
    clerkUserId,
    requireUser: true,
    requireProfile: true,
  });

  if (!profile) {
    return { stats: [], total: 0 };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  type Row = { platform: string; clicks: string | number };

  const result = await dashboardQuery(() =>
    db.execute<Row>(
      drizzleSql`
        select
          coalesce(sl.platform, ce.link_type) as platform,
          count(*) as clicks
        from ${clickEvents} ce
        left join ${socialLinks} sl on sl.id = ce.link_id
        where ce.creator_profile_id = ${profile.id}
          and ce.created_at >= ${thirtyDaysAgo.toISOString()}::timestamptz
          and (ce.is_bot = false or ce.is_bot is null)
        group by coalesce(sl.platform, ce.link_type)
        order by clicks desc
        limit 10
      `
    )
  );

  const stats: LinkClickStat[] = (result.rows ?? []).map(row => ({
    platform: String(row.platform ?? 'other'),
    clicks: Number(row.clicks),
  }));

  const total = stats.reduce((sum, s) => sum + s.clicks, 0);

  return { stats, total };
}
