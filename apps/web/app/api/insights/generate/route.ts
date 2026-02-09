import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { aggregateMetrics } from '@/lib/services/insights/data-aggregator';
import { generateInsights } from '@/lib/services/insights/insight-generator';
import {
  canGenerateInsights,
  completeGenerationRun,
  createGenerationRun,
  getExistingInsightTypes,
  persistInsights,
} from '@/lib/services/insights/lifecycle';
import { MIN_TOTAL_CLICKS } from '@/lib/services/insights/thresholds';

/**
 * POST /api/insights/generate
 *
 * Triggers AI insight generation for the authenticated user's creator profile.
 * Rate limited to 1 generation per hour per user.
 */
export async function POST() {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Check cooldown
    const { allowed, nextAllowedAt } = await canGenerateInsights(profile.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before generating again.',
          nextAllowedAt: nextAllowedAt?.toISOString(),
        },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    // Create a generation run record
    const run = await createGenerationRun(profile.id);
    const startTime = Date.now();

    try {
      // Aggregate metrics
      const metrics = await aggregateMetrics(profile.id);

      // Check minimum data threshold
      const totalDataPoints =
        metrics.traffic.totalClicksCurrent +
        metrics.traffic.totalClicksPrevious;
      if (totalDataPoints < MIN_TOTAL_CLICKS) {
        await completeGenerationRun(run.id, {
          status: 'completed',
          insightsGenerated: 0,
          dataPointsAnalyzed: totalDataPoints,
          durationMs: Date.now() - startTime,
        });

        return NextResponse.json(
          {
            runId: run.id,
            status: 'completed',
            insightsGenerated: 0,
            dataPointsAnalyzed: totalDataPoints,
            durationMs: Date.now() - startTime,
            message:
              'Insufficient data for insight generation. Keep sharing your profile to build up analytics.',
          },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      // Get existing insight types to avoid duplicates
      const existingTypes = await getExistingInsightTypes(profile.id);

      // Generate insights via AI
      const result = await generateInsights(metrics, existingTypes);

      // Persist insights
      const persisted = await persistInsights(
        profile.id,
        run.id,
        result.insights,
        metrics.period,
        metrics.comparisonPeriod
      );

      const durationMs = Date.now() - startTime;

      // Complete the run
      await completeGenerationRun(run.id, {
        status: 'completed',
        insightsGenerated: persisted,
        dataPointsAnalyzed: totalDataPoints,
        modelUsed: result.modelUsed,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs,
      });

      return NextResponse.json(
        {
          runId: run.id,
          status: 'completed',
          insightsGenerated: persisted,
          dataPointsAnalyzed: totalDataPoints,
          durationMs,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    } catch (innerError) {
      // Mark the run as failed
      await completeGenerationRun(run.id, {
        status: 'failed',
        insightsGenerated: 0,
        dataPointsAnalyzed: 0,
        durationMs: Date.now() - startTime,
        error:
          innerError instanceof Error ? innerError.message : 'Unknown error',
      });

      throw innerError;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    Sentry.captureException(error, {
      tags: { route: '/api/insights/generate', method: 'POST' },
    });

    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
