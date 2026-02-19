/**
 * Consolidated Daily Maintenance Cron Handler
 *
 * Runs once daily at midnight UTC. Handles all daily/weekly housekeeping
 * in a single function with one cold start and one DB connection.
 *
 * Sub-jobs:
 * - Schedule release notifications: every day (time-sensitive, runs first)
 * - Cleanup orphaned photos: every day
 * - Cleanup expired idempotency keys: every day
 * - Billing reconciliation: every day (safety net for webhooks)
 * - Data retention: Sundays only (heavy operation)
 *
 * Each sub-job runs in an independent try-catch so one failure
 * doesn't block the others.
 *
 * Schedule: 0 0 * * * (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { runReconciliation } from '../billing-reconciliation/route';
import { cleanupExpiredKeys } from '../cleanup-idempotency-keys/route';
import { cleanupOrphanedPhotos } from '../cleanup-photos/route';
import { scheduleReleaseNotifications } from '../schedule-release-notifications/route';

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

  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const results: Record<string, SubJobResult> = {};

  // 1. Schedule release notifications — runs first (time-sensitive)
  results.scheduleNotifications = await runSubJob(
    'scheduleNotifications',
    scheduleReleaseNotifications
  );

  // 2. Cleanup orphaned photos
  results.cleanupPhotos = await runSubJob(
    'cleanupPhotos',
    cleanupOrphanedPhotos
  );

  // 3. Cleanup expired idempotency keys
  results.cleanupKeys = await runSubJob('cleanupKeys', async () => ({
    deleted: await cleanupExpiredKeys(),
  }));

  // 4. Billing reconciliation (daily safety net for webhooks)
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

  // 5. Data retention — Sundays only (heavy operation)
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
