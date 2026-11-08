import 'server-only';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';

export interface ReleaseClickCountRow {
  readonly total: number;
  readonly priorDay: number;
}

/**
 * Human (non-bot) release click-outs per release, lifetime and for one UTC
 * day. Feeds the per-song daily snapshot job.
 */
export async function getReleaseClickCounts(
  creatorProfileId: string,
  priorDay: string
): Promise<ReadonlyMap<string, ReleaseClickCountRow>> {
  const result = await db.execute<{
    release_id: string;
    total: string | number;
    prior_day: string | number;
  }>(drizzleSql`
    select ${clickEvents.metadata} ->> 'contentId' as release_id,
           count(*) as total,
           count(*) filter (where ${clickEvents.createdAt}::date = ${priorDay}::date) as prior_day
    from ${clickEvents}
    where ${clickEvents.creatorProfileId} = ${creatorProfileId}
      and ${clickEvents.isBot} = false
      and ${clickEvents.metadata} ->> 'contentType' = 'release'
      and ${clickEvents.metadata} ->> 'contentId' is not null
    group by 1
  `);
  const map = new Map<string, ReleaseClickCountRow>();
  for (const row of result.rows ?? []) {
    map.set(row.release_id, {
      total: Number(row.total),
      priorDay: Number(row.prior_day),
    });
  }
  return map;
}
