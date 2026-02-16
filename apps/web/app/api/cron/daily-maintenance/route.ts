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
  try {
    const schedResult = await scheduleReleaseNotifications();
    results.scheduleNotifications = {
      success: true,
      data: schedResult as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[daily-maintenance] Schedule notifications failed:', error);
    await captureError(
      'Daily maintenance: schedule notifications failed',
      error,
      { route: '/api/cron/daily-maintenance', subjob: 'scheduleNotifications' }
    );
    results.scheduleNotifications = { success: false, error: msg };
  }

  // 2. Cleanup orphaned photos
  try {
    const photoResult = await cleanupOrphanedPhotos();
    results.cleanupPhotos = {
      success: true,
      data: photoResult as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[daily-maintenance] Cleanup photos failed:', error);
    await captureError('Daily maintenance: cleanup photos failed', error, {
      route: '/api/cron/daily-maintenance',
      subjob: 'cleanupPhotos',
    });
    results.cleanupPhotos = { success: false, error: msg };
  }

  // 3. Cleanup expired idempotency keys
  try {
    const keysDeleted = await cleanupExpiredKeys();
    results.cleanupKeys = {
      success: true,
      data: { deleted: keysDeleted },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[daily-maintenance] Cleanup keys failed:', error);
    await captureError('Daily maintenance: cleanup keys failed', error, {
      route: '/api/cron/daily-maintenance',
      subjob: 'cleanupKeys',
    });
    results.cleanupKeys = { success: false, error: msg };
  }

  // 4. Billing reconciliation (daily safety net for webhooks)
  try {
    const billingResult = await runReconciliation();
    results.billingReconciliation = {
      success: billingResult.success,
      data: {
        stats: billingResult.stats,
        duration: billingResult.duration,
        errors: billingResult.errors.length,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[daily-maintenance] Billing reconciliation failed:', error);
    await captureError(
      'Daily maintenance: billing reconciliation failed',
      error,
      { route: '/api/cron/daily-maintenance', subjob: 'billingReconciliation' }
    );
    results.billingReconciliation = { success: false, error: msg };
  }

  // 5. Data retention — Sundays only (heavy operation)
  const isSunday = new Date().getDay() === 0;
  if (isSunday) {
    try {
      const retentionResult = await runDataRetentionCleanup();
      results.dataRetention = {
        success: true,
        data: {
          clickEventsDeleted: retentionResult.clickEventsDeleted,
          audienceMembersDeleted: retentionResult.audienceMembersDeleted,
          notificationSubscriptionsDeleted:
            retentionResult.notificationSubscriptionsDeleted,
          retentionDays: retentionResult.retentionDays,
          duration: retentionResult.duration,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[daily-maintenance] Data retention failed:', error);
      await captureError('Daily maintenance: data retention failed', error, {
        route: '/api/cron/daily-maintenance',
        subjob: 'dataRetention',
      });
      results.dataRetention = { success: false, error: msg };
    }
  } else {
    results.dataRetention = { success: true, skipped: true };
  }

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
