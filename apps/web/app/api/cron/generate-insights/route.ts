import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
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
  INSIGHTS_CRON_CONCURRENCY,
  INSIGHTS_CRON_PROFILE_TIMEOUT_MS,
  MAX_CRON_BATCH_SIZE,
  MIN_TOTAL_CLICKS,
} from '@/lib/services/insights/thresholds';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for batch processing

interface ProfileProcessResult {
  insightsGenerated: number;
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

async function processProfile(
  profileId: string
): Promise<ProfileProcessResult> {
  const run = await createGenerationRun(profileId);
  const runStart = Date.now();

  const metrics = await aggregateMetrics(profileId);
  const totalDataPoints =
    metrics.traffic.totalClicksCurrent + metrics.traffic.totalClicksPrevious;

  if (totalDataPoints < MIN_TOTAL_CLICKS) {
    await completeGenerationRun(run.id, {
      status: 'completed',
      insightsGenerated: 0,
      dataPointsAnalyzed: totalDataPoints,
      durationMs: Date.now() - runStart,
    });
    return { insightsGenerated: 0 };
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

  return { insightsGenerated: persisted };
}

function processProfileBatchResults(
  results: PromiseSettledResult<{
    profileId: string;
    profileResult: ProfileProcessResult;
  }>[],
  chunk: Array<{ profile_id: string }>,
  errors: string[]
): { processed: number; insightsTotal: number } {
  let processed = 0;
  let insightsTotal = 0;
  for (const [resultIndex, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      insightsTotal += result.value.profileResult.insightsGenerated;
      processed++;
    } else {
      const profileId = chunk[resultIndex]?.profile_id ?? 'unknown-profile';
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : 'Unknown error';
      errors.push(`Profile ${profileId}: ${msg}`);
      logger.error(
        `[insights-cron] Failed for profile ${profileId}:`,
        result.reason
      );
    }
  }
  return { processed, insightsTotal };
}

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

    // Find profiles with enough data that haven't been processed recently.
    // Starts from claimed pro/founding/growth profiles (small set), then
    // checks click counts per-profile using the partial non-bot index,
    // avoiding a full scan of the click_events table.
    const eligibleProfiles = await db
      .execute<{ profile_id: string }>(
        drizzleSql`
          SELECT cp.id as profile_id
          FROM ${creatorProfiles} cp
          INNER JOIN ${users} u ON u.id = cp.user_id
          WHERE cp.is_claimed = true
            AND cp.user_id IS NOT NULL
            AND (u.plan IN ('pro', 'founding', 'growth') OR u.is_pro = true)
            AND NOT EXISTS (
              SELECT 1 FROM ${insightGenerationRuns} igr
              WHERE igr.creator_profile_id = cp.id
                AND igr.created_at >= ${twentyHoursAgo.toISOString()}::timestamptz
                AND igr.status IN ('completed', 'processing')
            )
            AND (
              SELECT count(*)
              FROM ${clickEvents} ce
              WHERE ce.creator_profile_id = cp.id
                AND (ce.is_bot = false OR ce.is_bot IS NULL)
            ) >= ${MIN_TOTAL_CLICKS}
            AND (
              SELECT min(ce2.created_at)
              FROM ${clickEvents} ce2
              WHERE ce2.creator_profile_id = cp.id
                AND (ce2.is_bot = false OR ce2.is_bot IS NULL)
            ) <= ${sevenDaysAgo.toISOString()}::timestamp
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

    // 3. Process profiles in bounded concurrent chunks with per-profile timeout guard
    //    while preserving a 4 minute safety margin on the 5 minute max duration.
    const MAX_RUNTIME_MS = 240_000;
    for (
      let index = 0;
      index < eligibleProfiles.length;
      index += INSIGHTS_CRON_CONCURRENCY
    ) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        logger.warn(
          `[insights-cron] Approaching timeout after ${processed} profiles, stopping early`
        );
        break;
      }

      const chunk = eligibleProfiles.slice(
        index,
        index + INSIGHTS_CRON_CONCURRENCY
      );
      const results = await Promise.allSettled(
        chunk.map(({ profile_id: profileId }) =>
          withTimeout(
            processProfile(profileId),
            INSIGHTS_CRON_PROFILE_TIMEOUT_MS
          ).then(profileResult => ({ profileId, profileResult }))
        )
      );

      const batchStats = processProfileBatchResults(results, chunk, errors);
      processed += batchStats.processed;
      insightsTotal += batchStats.insightsTotal;
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
