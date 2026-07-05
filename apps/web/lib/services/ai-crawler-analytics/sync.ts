import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { fetchZoneAiCrawlerRows } from '@/lib/cloudflare/ai-crawler-analytics-fetch';
import { isCloudflareAnalyticsConfigured } from '@/lib/cloudflare/graphql-client';
import { db } from '@/lib/db';
import { aiCrawlerAnalyticsSnapshots } from '@/lib/db/schema/ai-crawler-analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { attributeAiCrawlerRows, type ProfileHandleRow } from './attribute';

const PERIOD_DAYS = 30;

export interface AiCrawlerSyncResult {
  readonly skipped: boolean;
  readonly reason?: string;
  readonly profilesUpdated: number;
  readonly durationMs: number;
}

async function loadProfileHandles(): Promise<ProfileHandleRow[]> {
  const rows = await db
    .select({
      profileId: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(drizzleSql`${creatorProfiles.usernameNormalized} IS NOT NULL`);

  return rows.map(row => ({
    profileId: row.profileId,
    usernameNormalized: row.usernameNormalized.toLowerCase(),
  }));
}

export async function syncAiCrawlerAnalytics(): Promise<AiCrawlerSyncResult> {
  const startedAt = Date.now();

  if (!isCloudflareAnalyticsConfigured()) {
    return {
      skipped: true,
      reason: 'Cloudflare analytics not configured',
      profilesUpdated: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - PERIOD_DAYS);

    const comparisonStart = new Date(periodStart);
    comparisonStart.setDate(comparisonStart.getDate() - PERIOD_DAYS);

    const weeklyCutoff = new Date(now);
    weeklyCutoff.setDate(weeklyCutoff.getDate() - 7);

    const [profiles, currentRows, previousRows] = await Promise.all([
      loadProfileHandles(),
      fetchZoneAiCrawlerRows(periodStart, now),
      fetchZoneAiCrawlerRows(comparisonStart, periodStart),
    ]);

    const aggregates = attributeAiCrawlerRows(
      profiles,
      currentRows,
      previousRows,
      periodStart,
      weeklyCutoff
    );

    if (aggregates.length === 0) {
      return {
        skipped: false,
        profilesUpdated: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    const syncedAt = new Date();

    await db
      .insert(aiCrawlerAnalyticsSnapshots)
      .values(
        aggregates.map(aggregate => ({
          creatorProfileId: aggregate.profileId,
          periodDays: PERIOD_DAYS,
          totalRequests: aggregate.totalRequests,
          weeklyRequests: aggregate.weeklyRequests,
          crawlers: aggregate.crawlers,
          dailyTrend: aggregate.dailyTrend,
          syncedAt,
          updatedAt: syncedAt,
        }))
      )
      .onConflictDoUpdate({
        target: [
          aiCrawlerAnalyticsSnapshots.creatorProfileId,
          aiCrawlerAnalyticsSnapshots.periodDays,
        ],
        set: {
          totalRequests: drizzleSql`excluded.total_requests`,
          weeklyRequests: drizzleSql`excluded.weekly_requests`,
          crawlers: drizzleSql`excluded.crawlers`,
          dailyTrend: drizzleSql`excluded.daily_trend`,
          syncedAt: drizzleSql`excluded.synced_at`,
          updatedAt: drizzleSql`excluded.updated_at`,
        },
      });

    logger.info('[ai-crawler-sync] Updated profile snapshots', {
      profilesUpdated: aggregates.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      skipped: false,
      profilesUpdated: aggregates.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    await captureError('AI crawler analytics sync failed', error, {
      route: 'sync-ai-crawler-analytics',
    });
    throw error;
  }
}
