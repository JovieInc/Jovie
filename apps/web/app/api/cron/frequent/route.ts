/**
 * Consolidated Frequent Cron Handler
 *
 * Runs every 15 minutes. Orchestrates sub-jobs that need sub-hourly frequency.
 * One cold start + one DB connection serves all jobs.
 *
 * Sub-jobs:
 * - Process campaigns: every invocation (15 min)
 * - Pixel forwarding retry: every other invocation (~30 min)
 * - Send release notifications: on the hour (~60 min)
 *
 * Each sub-job runs in an independent try-catch so one failure
 * doesn't block the others.
 *
 * Schedule: every 15 minutes (configured in vercel.json)
 */

import { NextResponse } from 'next/server';
import { processCampaigns } from '@/lib/email/campaigns/processor';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { cleanupExpiredSuppressions } from '@/lib/notifications/suppression';
import { processPendingEvents } from '@/lib/tracking/forwarding';
import { logger } from '@/lib/utils/logger';
import { sendPendingNotifications } from '../send-release-notifications/route';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  const minute = new Date().getMinutes();
  const results: Record<string, SubJobResult> = {};

  // 1. Process campaigns — every invocation (15 min)
  try {
    const campaignResult = await processCampaigns();
    const suppressionsCleared = await cleanupExpiredSuppressions();
    results.campaigns = {
      success: true,
      data: { ...campaignResult, suppressionsCleared },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[frequent-cron] Campaign processing failed:', error);
    await captureError('Frequent cron: campaign processing failed', error, {
      route: '/api/cron/frequent',
      subjob: 'campaigns',
    });
    results.campaigns = { success: false, error: msg };
  }

  // 2. Pixel forwarding retry — every other invocation (~30 min)
  if (minute >= 30) {
    try {
      const pixelResult = await processPendingEvents();
      results.pixelRetry = {
        success: true,
        data: pixelResult as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[frequent-cron] Pixel retry failed:', error);
      await captureError('Frequent cron: pixel retry failed', error, {
        route: '/api/cron/frequent',
        subjob: 'pixelRetry',
      });
      results.pixelRetry = { success: false, error: msg };
    }
  } else {
    results.pixelRetry = { success: true, skipped: true };
  }

  // 3. Send release notifications — on the hour (minute < 15)
  if (minute < 15) {
    try {
      const notifResult = await sendPendingNotifications();
      results.sendNotifications = {
        success: true,
        data: notifResult as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[frequent-cron] Send notifications failed:', error);
      await captureError('Frequent cron: send notifications failed', error, {
        route: '/api/cron/frequent',
        subjob: 'sendNotifications',
      });
      results.sendNotifications = { success: false, error: msg };
    }
  } else {
    results.sendNotifications = { success: true, skipped: true };
  }

  const duration = Date.now() - startTime;
  const allSuccessful = Object.values(results).every(r => r.success);

  logger.info(`[frequent-cron] Completed in ${duration}ms`, results);

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
