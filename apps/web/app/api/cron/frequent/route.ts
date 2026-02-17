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
import { warmAlphabetCache } from '@/lib/spotify/alphabet-cache';
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

async function runSubJob(
  name: string,
  fn: () => Promise<Record<string, unknown>>
): Promise<SubJobResult> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[frequent-cron] ${name} failed:`, error);
    await captureError(`Frequent cron: ${name} failed`, error, {
      route: '/api/cron/frequent',
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

  const minute = new Date().getMinutes();
  const results: Record<string, SubJobResult> = {};

  // 1. Process campaigns — every invocation (15 min)
  results.campaigns = await runSubJob('campaigns', async () => {
    const campaignResult = await processCampaigns();
    const suppressionsCleared = await cleanupExpiredSuppressions();
    return { ...campaignResult, suppressionsCleared };
  });

  // 2. Pixel forwarding retry — every other invocation (~30 min)
  results.pixelRetry =
    minute >= 30
      ? await runSubJob('pixelRetry', async () => {
          const pixelResult = await processPendingEvents();
          return pixelResult as unknown as Record<string, unknown>;
        })
      : { success: true, skipped: true };

  // 3. Send release notifications — on the hour (minute < 15)
  results.sendNotifications =
    minute < 15
      ? await runSubJob('sendNotifications', async () => {
          const notifResult = await sendPendingNotifications();
          return notifResult as unknown as Record<string, unknown>;
        })
      : { success: true, skipped: true };

  // 4. Warm Spotify alphabet cache — every 6 hours
  const hour = new Date().getHours();
  if (hour % 6 === 0 && minute < 15) {
    try {
      const warmResult = await warmAlphabetCache();
      results.alphabetCache = {
        success: true,
        data: warmResult as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[frequent-cron] Alphabet cache warming failed:', error);
      await captureError(
        'Frequent cron: alphabet cache warming failed',
        error,
        {
          route: '/api/cron/frequent',
          subjob: 'alphabetCache',
        }
      );
      results.alphabetCache = { success: false, error: msg };
    }
  } else {
    results.alphabetCache = { success: true, skipped: true };
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
