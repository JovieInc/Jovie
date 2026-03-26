/**
 * Campaign Processing Cron Job
 *
 * Processes drip campaign enrollments and sends follow-up emails.
 * Schedule: Every 15 minutes (configured in vercel.json)
 */

import { NextResponse } from 'next/server';

import { verifyCronRequest } from '@/lib/cron/auth';
import { processCampaigns } from '@/lib/email/campaigns/processor';
import { captureError } from '@/lib/error-tracking';
import { cleanupExpiredSuppressions } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/process-campaigns',
  });
  if (authError) return authError;

  const startTime = Date.now();

  try {
    // Process campaign enrollments
    const campaignResult = await processCampaigns();

    // Also cleanup expired soft bounce suppressions
    const suppressionsCleared = await cleanupExpiredSuppressions();

    const duration = Date.now() - startTime;

    logger.info('[process-campaigns] Completed', {
      duration,
      ...campaignResult,
      suppressionsCleared,
    });

    return NextResponse.json(
      {
        success: true,
        duration,
        campaigns: campaignResult,
        suppressionsCleared,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('[process-campaigns] Failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    });
    await captureError('Campaign processing cron failed', error, {
      route: '/api/cron/process-campaigns',
      method: 'GET',
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
        duration,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
