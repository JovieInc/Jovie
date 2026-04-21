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
 * - Data retention: Sundays only (heavy operation)
 *
 * Each sub-job runs in an independent try-catch so one failure
 * doesn't block the others.
 *
 * Schedule: 0 0 * * * (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { verifyCronRequest } from '@/lib/cron/auth';
import { runMonitoredCron } from '@/lib/cron/monitoring';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { runReconciliation } from '../billing-reconciliation/route';
import { cleanupExpiredKeys } from '../cleanup-idempotency-keys/route';
import { cleanupOrphanedPhotos } from '../cleanup-photos/route';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for all sub-jobs

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const DAILY_MAINTENANCE_MONITOR = {
  slug: 'cron-daily-maintenance',
  schedule: '0 0 * * *',
  maxRuntime: 5,
  checkinMargin: 15,
} as const;

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
  const authError = verifyCronRequest(request, {
    route: '/api/cron/daily-maintenance',
  });
  if (authError) return authError;

  return runMonitoredCron(
    {
      monitor: DAILY_MAINTENANCE_MONITOR,
      shouldFailResult: response => response.status !== 200,
    },
    async () => {
      const startTime = Date.now();
      const results: Record<string, SubJobResult> = {};

      results.cleanupPhotos = await runSubJob(
        'cleanupPhotos',
        cleanupOrphanedPhotos
      );

      results.cleanupKeys = await runSubJob('cleanupKeys', async () => ({
        deleted: await cleanupExpiredKeys(),
      }));

      results.billingReconciliation = await runSubJob(
        'billingReconciliation',
        async () => {
          const result = await runReconciliation();
          return {
            success: result.success,
            stats: result.stats,
            duration: result.duration,
            errors: result.errors.length,
          };
        }
      );

      const isSunday = new Date().getDay() === 0;
      results.dataRetention = isSunday
        ? await runSubJob('dataRetention', runDataRetentionCleanup)
        : { success: true, skipped: true };

      const duration = Date.now() - startTime;
      const allSuccessful = Object.values(results).every(
        result => result.success
      );

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
  );
}
