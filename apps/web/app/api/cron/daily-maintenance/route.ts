/**
 * Consolidated Daily Maintenance Cron Handler
 *
 * Runs once daily at midnight UTC. Handles all daily/weekly housekeeping
 * in a single function with one cold start and one DB connection.
 *
 * Sub-jobs:
 * - Cleanup orphaned photos: every day
 * - Cleanup expired idempotency keys: every day
 * - Billing reconciliation: every day (safety net for webhooks)
 * - Cleanup SMS subscribe intents: every day (folded from standalone cron per JOV-1901)
 * - Waitlist auto-accept: every day when enabled
 * - Onboarding script self-improvement: every day (JOV-3806)
 * - Data retention: Sundays only (heavy operation)
 * - Under-enriched discography sweep: every day (bounded batch)
 * - AI crawler analytics sync: every day (Cloudflare GraphQL, GH-12748)
 *
 * Each sub-job runs in an independent try-catch so one failure
 * doesn't block the others.
 *
 * Schedule: 0 0 * * * (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { verifyCronRequest } from '@/lib/cron/auth';
import { sweepUnderEnrichedProfilesForCron } from '@/lib/discography/re-enrich';
import { captureError } from '@/lib/error-tracking';
import { runOnboardingScriptAggregation } from '@/lib/onboarding/script-aggregation';
import { logger } from '@/lib/utils/logger';
import { runWaitlistAutoAccept } from '@/lib/waitlist/auto-accept';
import { runReconciliation } from '../billing-reconciliation/route';
import { cleanupExpiredKeys } from '../cleanup-idempotency-keys/route';
import { cleanupOrphanedPhotos } from '../cleanup-photos/route';
import { cleanupSmsIntents } from '../cleanup-sms-intents/route';
import { syncAiCrawlerAnalyticsCron } from '../sync-ai-crawler-analytics/route';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for all sub-jobs

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface SubJobResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

async function runSubJob(
  name: string,
  fn: () => Promise<unknown>
): Promise<SubJobResult> {
  try {
    const data = await fn();
    return { success: true, data: data as Record<string, unknown> };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[daily-maintenance] ${name} failed:`, error);
    await captureError(`Daily maintenance: ${name} failed`, error, {
      route: '/api/cron/daily-maintenance',
      subjob: name,
    });
    return { success: false, error: msg };
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();

  const authError = verifyCronRequest(request, {
    route: '/api/cron/daily-maintenance',
  });
  if (authError) return authError;

  const results: Record<string, SubJobResult> = {};

  // 1. Cleanup orphaned photos
  results.cleanupPhotos = await runSubJob(
    'cleanupPhotos',
    cleanupOrphanedPhotos
  );

  // 2. Cleanup expired idempotency keys
  results.cleanupKeys = await runSubJob('cleanupKeys', async () => ({
    deleted: await cleanupExpiredKeys(),
  }));

  // 3. Billing reconciliation (daily safety net for webhooks)
  results.billingReconciliation = await runSubJob(
    'billingReconciliation',
    async () => {
      const r = await runReconciliation();
      return {
        success: r.success,
        stats: r.stats,
        duration: r.duration,
        errors: r.errors.length,
      };
    }
  );

  // 4. Cleanup SMS subscribe intents (folded from standalone cron per JOV-1901)
  results.cleanupSmsIntents = await runSubJob(
    'cleanupSmsIntents',
    cleanupSmsIntents
  );

  // 5. Waitlist auto-accept — no-op unless enabled by admin settings
  results.waitlistAutoAccept = await runSubJob(
    'waitlistAutoAccept',
    runWaitlistAutoAccept
  );

  // 6. Under-enriched discography sweep — bounded daily batch (JOV-3068)
  results.discographyReEnrich = await runSubJob(
    'discographyReEnrich',
    sweepUnderEnrichedProfilesForCron
  );

  // 7. Onboarding script self-improvement — recompute conversion counters,
  //    mine lint-clean LLM candidates, promote/retire variants (JOV-3806)
  results.onboardingScriptAggregation = await runSubJob(
    'onboardingScriptAggregation',
    runOnboardingScriptAggregation
  );

  // 8. AI crawler analytics sync — Cloudflare edge analytics (GH-12748)
  results.aiCrawlerAnalytics = await runSubJob(
    'aiCrawlerAnalytics',
    syncAiCrawlerAnalyticsCron
  );

  // 9. Data retention — Sundays only (heavy operation)
  const isSunday = new Date().getDay() === 0;
  results.dataRetention = isSunday
    ? await runSubJob('dataRetention', runDataRetentionCleanup)
    : { success: true, skipped: true };

  const duration = Date.now() - startTime;
  const allSuccessful = Object.values(results).every(r => r.success);

  logger.info(`[daily-maintenance] Completed in ${duration}ms`, results);

  return NextResponse.json(
    {
      success: allSuccessful,
      results,
      duration,
    },
    {
      status: allSuccessful ? 200 : 207,
      headers: NO_STORE_HEADERS,
    }
  );
}
