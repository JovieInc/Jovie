import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';

import { db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import {
  clickEvents,
  dailyProfileViews,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';

export interface AdminBraggingRights {
  /** Unique record labels sorted by frequency (most common first) */
  labels: string[];
  /** Unique distributors sorted by frequency (most common first) */
  distributors: string[];
  /** Sum of all profile views across all creators */
  totalProfileViews: number;
  /** Total DSP / listen link clicks across all creators */
  totalDspClicks: number;
  /** Total active notification subscriptions (email + SMS, not unsubscribed) */
  totalContactsCaptured: number;
}

async function getTopLabels(): Promise<string[]> {
  try {
    const rows = await db
      .select({
        label: discogReleases.label,
      })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.isClaimed, true),
          drizzleSql`${discogReleases.label} IS NOT NULL AND ${discogReleases.label} <> ''`
        )
      )
      .groupBy(discogReleases.label)
      .orderBy(desc(drizzleSql<number>`count(*)`), discogReleases.label);

    return rows
      .map(r => r.label)
      .filter(
        (l): l is string => l !== null && l !== undefined && l.trim() !== ''
      );
  } catch (error) {
    captureError('Error fetching distinct labels for bragging rights', error);
    return [];
  }
}

async function getTopDistributors(): Promise<string[]> {
  try {
    const rows = await db
      .select({
        distributor: discogReleases.distributor,
      })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.isClaimed, true),
          drizzleSql`${discogReleases.distributor} IS NOT NULL AND ${discogReleases.distributor} <> ''`
        )
      )
      .groupBy(discogReleases.distributor)
      .orderBy(desc(drizzleSql<number>`count(*)`), discogReleases.distributor);

    return rows
      .map(r => r.distributor)
      .filter(
        (d): d is string => d !== null && d !== undefined && d.trim() !== ''
      );
  } catch (error) {
    captureError(
      'Error fetching distinct distributors for bragging rights',
      error
    );
    return [];
  }
}

async function getTotalProfileViews(): Promise<number> {
  try {
    const hasDailyProfileViews = await doesTableExist(
      TABLE_NAMES.dailyProfileViews
    );
    if (!hasDailyProfileViews) {
      return 0;
    }

    const [row] = await db
      .select({
        total: drizzleSql<number>`COALESCE(SUM(${dailyProfileViews.viewCount}), 0)::int`,
      })
      .from(dailyProfileViews);
    return Number(row?.total ?? 0);
  } catch (error) {
    captureError(
      'Error fetching total profile views for bragging rights',
      error
    );
    return 0;
  }
}

async function getTotalDspClicks(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: drizzleSql<number>`count(*)::int` })
      .from(clickEvents)
      .where(drizzleSql`${clickEvents.linkType} = 'listen'`);
    return Number(row?.total ?? 0);
  } catch (error) {
    captureError('Error fetching total DSP clicks for bragging rights', error);
    return 0;
  }
}

async function getTotalContactsCaptured(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: drizzleSql<number>`count(*)::int` })
      .from(notificationSubscriptions)
      .where(drizzleSql`${notificationSubscriptions.unsubscribedAt} IS NULL`);
    return Number(row?.total ?? 0);
  } catch (error) {
    captureError('Error fetching total contacts for bragging rights', error);
    return 0;
  }
}

export async function getAdminBraggingRights(): Promise<AdminBraggingRights> {
  const [
    labels,
    distributors,
    totalProfileViews,
    totalDspClicks,
    totalContactsCaptured,
  ] = await Promise.all([
    getTopLabels(),
    getTopDistributors(),
    getTotalProfileViews(),
    getTotalDspClicks(),
    getTotalContactsCaptured(),
  ]);

  return {
    labels,
    distributors,
    totalProfileViews,
    totalDspClicks,
    totalContactsCaptured,
  };
}
