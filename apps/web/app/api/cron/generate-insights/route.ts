import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import { insightGenerationRuns } from '@/lib/db/schema/insights';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { aggregateMetrics } from '@/lib/services/insights/data-aggregator';
import { generateInsights } from '@/lib/services/insights/insight-generator';
import {
  completeGenerationRun,
  createGenerationRun,
  expireStaleInsights,
  getExistingInsightTypes,
  persistInsights,
} from '@/lib/services/insights/lifecycle';
import {
  MAX_CRON_BATCH_SIZE,
  MIN_TOTAL_CLICKS,
} from '@/lib/services/insights/thresholds';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for batch processing

/**
 * GET /api/cron/generate-insights
 *
 * Scheduled cron job that generates AI insights for eligible creator profiles.
 * Runs daily. Processes up to MAX_CRON_BATCH_SIZE profiles per run.
 */
export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    // 1. Expire stale insights first
    const expired = await expireStaleInsights();
    logger.info(`[insights-cron] Expired ${expired} stale insights`);

    // 2. Find eligible profiles:
    //    - Claimed profiles with sufficient click data
    //    - No generation run in the last 20 hours
    const twentyHoursAgo = new Date();
    twentyHoursAgo.setHours(twentyHoursAgo.getHours() - 20);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find profiles with enough data that haven't been processed recently
    const eligibleProfiles = await db
      .execute<{ profile_id: string }>(
        drizzleSql`
          SELECT cp.id as profile_id
          FROM ${creatorProfiles} cp
          WHERE cp.is_claimed = true
            AND cp.user_id IS NOT NULL
            -- Has minimum click activity
            AND (
              SELECT count(*)
              FROM ${clickEvents} ce
              WHERE ce.creator_profile_id = cp.id
                AND (ce.is_bot = false OR ce.is_bot IS NULL)
            ) >= ${MIN_TOTAL_CLICKS}
            -- Has data spanning at least 7 days
            AND (
              SELECT min(ce.created_at)
              FROM ${clickEvents} ce
              WHERE ce.creator_profile_id = cp.id
                AND (ce.is_bot = false OR ce.is_bot IS NULL)
            ) <= ${sevenDaysAgo.toISOString()}::timestamp
            -- No recent generation run
            AND NOT EXISTS (
              SELECT 1 FROM ${insightGenerationRuns} igr
              WHERE igr.creator_profile_id = cp.id
                AND igr.created_at >= ${twentyHoursAgo.toISOString()}::timestamp
                AND igr.status IN ('completed', 'processing')
            )
          ORDER BY cp.profile_views DESC
          LIMIT ${MAX_CRON_BATCH_SIZE}
        `
      )
      .then(res => res.rows);

    logger.info(
      `[insights-cron] Found ${eligibleProfiles.length} eligible profiles`
    );

    let processed = 0;
    let insightsTotal = 0;
    const errors: string[] = [];

    // 3. Process each profile
    for (const { profile_id: profileId } of eligibleProfiles) {
      let runId: string | null = null;
      let runStart = Date.now();
      let dataPointsAnalyzed = 0;
      try {
        const run = await createGenerationRun(profileId);
        runId = run.id;
        runStart = Date.now();

        const metrics = await aggregateMetrics(profileId);
        const totalDataPoints =
          metrics.traffic.totalClicksCurrent +
          metrics.traffic.totalClicksPrevious;
        dataPointsAnalyzed = totalDataPoints;

        if (totalDataPoints < MIN_TOTAL_CLICKS) {
          await completeGenerationRun(run.id, {
            status: 'completed',
            insightsGenerated: 0,
            dataPointsAnalyzed: totalDataPoints,
            durationMs: Date.now() - runStart,
          });
          processed++;
          continue;
        }

        const existingTypes = await getExistingInsightTypes(profileId);
        const result = await generateInsights(metrics, existingTypes);

        const persisted = await persistInsights(
          profileId,
          run.id,
          result.insights,
          metrics.period,
          metrics.comparisonPeriod
        );

        await completeGenerationRun(run.id, {
          status: 'completed',
          insightsGenerated: persisted,
          dataPointsAnalyzed: totalDataPoints,
          modelUsed: result.modelUsed,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          durationMs: Date.now() - runStart,
        });

        insightsTotal += persisted;
        processed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (runId) {
          try {
            await completeGenerationRun(runId, {
              status: 'failed',
              insightsGenerated: 0,
              dataPointsAnalyzed,
              durationMs: Date.now() - runStart,
              error: msg,
            });
          } catch (updateError) {
            logger.error(
              `[insights-cron] Failed to update run status for profile ${profileId}:`,
              updateError
            );
          }
        }
        errors.push(`Profile ${profileId}: ${msg}`);
        logger.error(`[insights-cron] Failed for profile ${profileId}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[insights-cron] Completed: ${processed}/${eligibleProfiles.length} profiles, ${insightsTotal} insights, ${duration}ms`
    );

    return NextResponse.json(
      {
        success: true,
        stats: {
          eligibleProfiles: eligibleProfiles.length,
          processed,
          insightsGenerated: insightsTotal,
          expired,
          errors: errors.length,
        },
        errors: errors.length > 0 ? errors : undefined,
        duration,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[insights-cron] Fatal error:', error);

    Sentry.captureException(error, {
      tags: { route: '/api/cron/generate-insights', method: 'GET' },
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
