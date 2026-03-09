import 'server-only';

import { sql as drizzleSql, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  clickEvents,
  dailyProfileViews,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { discogReleases } from '@/lib/db/schema/content';
import { captureError } from '@/lib/error-tracking';

export interface AdminBraggingRights {
  /** Unique record labels (sorted) */
  labels: string[];
  /** Unique distributors (sorted) */
  distributors: string[];
  /** Sum of all profile views across all creators */
  totalProfileViews: number;
  /** Total DSP / listen link clicks across all creators */
  totalDspClicks: number;
  /** Total active notification subscriptions (email + SMS, not unsubscribed) */
  totalContactsCaptured: number;
}

async function getDistinctLabels(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ label: discogReleases.label })
      .from(discogReleases)
      .where(
        isNull(discogReleases.label)
          ? undefined
          : drizzleSql`${discogReleases.label} IS NOT NULL AND ${discogReleases.label} <> ''`
      );

    return rows
      .map(r => r.label)
      .filter(
        (l): l is string => l !== null && l !== undefined && l.trim() !== ''
      )
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    captureError('Error fetching distinct labels for bragging rights', error);
    return [];
  }
}

async function getDistinctDistributors(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ distributor: discogReleases.distributor })
      .from(discogReleases)
      .where(
        isNull(discogReleases.distributor)
          ? undefined
          : drizzleSql`${discogReleases.distributor} IS NOT NULL AND ${discogReleases.distributor} <> ''`
      );

    return rows
      .map(r => r.distributor)
      .filter(
        (d): d is string => d !== null && d !== undefined && d.trim() !== ''
      )
      .sort((a, b) => a.localeCompare(b));
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
    getDistinctLabels(),
    getDistinctDistributors(),
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
