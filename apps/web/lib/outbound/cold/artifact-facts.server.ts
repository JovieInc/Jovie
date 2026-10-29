import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { OutboundArtifactFacts } from '../queue';

/**
 * Catalog facts for built profiles, read from what the profile actually
 * carries: releases on the page, the newest released one, and confirmed
 * streaming-service matches. These are the only facts a cold draft may cite.
 * One batched read.
 */
export async function readOutboundArtifactFacts(
  profileIds: readonly string[]
): Promise<Map<string, OutboundArtifactFacts>> {
  const facts = new Map<string, OutboundArtifactFacts>();
  if (profileIds.length === 0) return facts;
  const ids = drizzleSql.join(
    profileIds.map(id => drizzleSql`${id}::uuid`),
    drizzleSql`, `
  );
  const result = await db.execute<{
    id: string;
    release_count: number | string;
    platform_count: number | string;
    latest_title: string | null;
    latest_date: string | null;
  }>(drizzleSql`
    select p.id::text as id,
      (select count(*) from discog_releases r
        where r.creator_profile_id = p.id and r.deleted_at is null) as release_count,
      (select count(distinct m.provider_id) from dsp_artist_matches m
        where m.creator_profile_id = p.id
          and m.status in ('confirmed', 'auto_confirmed')) as platform_count,
      latest.title as latest_title,
      to_char(latest.release_date, 'YYYY-MM-DD') as latest_date
    from creator_profiles p
    left join lateral (
      select r.title, r.release_date from discog_releases r
      where r.creator_profile_id = p.id and r.deleted_at is null
        and r.release_date is not null and r.release_date <= now()
      order by r.release_date desc
      limit 1
    ) latest on true
    where p.id in (${ids})
  `);
  for (const row of result.rows) {
    facts.set(row.id, {
      releaseCount: Number(row.release_count) || 0,
      platformCount: Number(row.platform_count) || 0,
      latestRelease:
        row.latest_title && row.latest_date
          ? { title: row.latest_title, releasedOn: row.latest_date }
          : null,
    });
  }
  return facts;
}
