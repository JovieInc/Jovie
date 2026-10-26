import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import {
  buildFeaturedReport,
  type FeaturedReportLine,
  parseFeaturedExtras,
} from './metrics';

/**
 * Count one featured impression or tap. Counts only, no identifiers.
 * Measurement must never break the beacon path: it never throws.
 */
export async function recordFeaturedSlotEvent(input: {
  readonly event: string;
  readonly profileId: string;
  readonly extras:
    | Readonly<Record<string, string | number | boolean>>
    | undefined;
  readonly now?: Date;
}): Promise<boolean> {
  const isTap = input.event === 'featured_tap';
  if (!isTap && input.event !== 'pac_exposure') return false;
  const key = parseFeaturedExtras(input.extras);
  if (!key) return false;
  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  const impressions = isTap ? 0 : 1;
  const taps = isTap ? 1 : 0;
  try {
    await db.execute(drizzleSql`
      INSERT INTO featured_slot_daily
        (day, creator_profile_id, kind, reason, channel, impressions, taps)
      VALUES
        (${day}::date, ${input.profileId}::uuid, ${key.kind}, ${key.reason},
         ${key.channel}, ${impressions}, ${taps})
      ON CONFLICT (day, creator_profile_id, kind, reason, channel) DO UPDATE SET
        impressions = featured_slot_daily.impressions + EXCLUDED.impressions,
        taps = featured_slot_daily.taps + EXCLUDED.taps
    `);
    return true;
  } catch (error) {
    // Unknown profile (foreign key) or a transient DB error: drop the count.
    await captureError('featured slot counter write failed', error, {
      route: '/api/profile/pac-event',
    }).catch(() => undefined);
    return false;
  }
}

export async function getFeaturedSlotReport(
  days = 14
): Promise<FeaturedReportLine[]> {
  const result = await db.execute<{
    kind: string;
    reason: string;
    impressions: string | number;
    taps: string | number;
  }>(drizzleSql`
    SELECT kind, reason,
           SUM(impressions)::bigint AS impressions,
           SUM(taps)::bigint AS taps
    FROM featured_slot_daily
    WHERE day >= (now() AT TIME ZONE 'utc')::date - ${days}::int
    GROUP BY kind, reason
  `);
  const rows = (result.rows ?? result) as Array<{
    kind: string;
    reason: string;
    impressions: string | number;
    taps: string | number;
  }>;
  return buildFeaturedReport(
    rows.map(row => ({
      kind: row.kind,
      reason: row.reason,
      impressions: Number(row.impressions),
      taps: Number(row.taps),
    }))
  );
}
