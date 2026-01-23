import { sql as drizzleSql } from 'drizzle-orm';
import { getRetentionDays } from '@/lib/analytics/data-retention';
import { db } from '@/lib/db';
import {
  clickEventDailyLinkRollups,
  clickEventDailyRollups,
  clickEvents,
} from '@/lib/db/schema';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ROLLUP_LOCK_ID = 872349;

function startOfUtcDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function getRollupWindow(retentionDays: number): {
  windowStart: Date;
  windowEnd: Date;
} {
  const now = new Date();
  const windowStart = startOfUtcDay(
    new Date(now.getTime() - (retentionDays - 1) * MS_PER_DAY)
  );
  return { windowStart, windowEnd: now };
}

export interface ClickRollupResult {
  refreshed: boolean;
  retentionDays: number;
  windowStart: Date;
  windowEnd: Date;
  durationMs: number;
  reason?: string;
}

export async function refreshClickEventRollups(options?: {
  retentionDays?: number;
}): Promise<ClickRollupResult> {
  const retentionDays = options?.retentionDays ?? getRetentionDays();
  const { windowStart, windowEnd } = getRollupWindow(retentionDays);
  const startTime = Date.now();

  return await db.transaction(async tx => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      drizzleSql`SELECT pg_try_advisory_xact_lock(${ROLLUP_LOCK_ID}) as locked`
    );
    const locked = Boolean(lockResult.rows?.[0]?.locked);
    if (!locked) {
      return {
        refreshed: false,
        retentionDays,
        windowStart,
        windowEnd,
        durationMs: Date.now() - startTime,
        reason: 'rollup already running',
      };
    }

    await tx.execute(drizzleSql`
      DELETE FROM ${clickEventDailyLinkRollups}
      WHERE ${clickEventDailyLinkRollups.day} >= ${windowStart}::date
    `);

    await tx.execute(drizzleSql`
      DELETE FROM ${clickEventDailyRollups}
      WHERE ${clickEventDailyRollups.day} >= ${windowStart}::date
    `);

    await tx.execute(drizzleSql`
      INSERT INTO ${clickEventDailyRollups} (
        creator_profile_id,
        day,
        link_type,
        total_count,
        created_at,
        updated_at
      )
      SELECT
        ${clickEvents.creatorProfileId},
        date(${clickEvents.createdAt}) AS day,
        ${clickEvents.linkType},
        COUNT(*)::int AS total_count,
        now(),
        now()
      FROM ${clickEvents}
      WHERE ${clickEvents.createdAt} >= ${windowStart}
        AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
      GROUP BY
        ${clickEvents.creatorProfileId},
        date(${clickEvents.createdAt}),
        ${clickEvents.linkType}
    `);

    await tx.execute(drizzleSql`
      INSERT INTO ${clickEventDailyLinkRollups} (
        creator_profile_id,
        day,
        link_type,
        link_id,
        total_count,
        created_at,
        updated_at
      )
      SELECT
        ${clickEvents.creatorProfileId},
        date(${clickEvents.createdAt}) AS day,
        ${clickEvents.linkType},
        ${clickEvents.linkId},
        COUNT(*)::int AS total_count,
        now(),
        now()
      FROM ${clickEvents}
      WHERE ${clickEvents.createdAt} >= ${windowStart}
        AND ${clickEvents.linkId} IS NOT NULL
        AND (${clickEvents.isBot} = false OR ${clickEvents.isBot} IS NULL)
      GROUP BY
        ${clickEvents.creatorProfileId},
        date(${clickEvents.createdAt}),
        ${clickEvents.linkType},
        ${clickEvents.linkId}
    `);

    return {
      refreshed: true,
      retentionDays,
      windowStart,
      windowEnd,
      durationMs: Date.now() - startTime,
    };
  });
}
