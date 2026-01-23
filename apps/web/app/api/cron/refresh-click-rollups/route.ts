/**
 * Click Event Rollup Refresh Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to refresh click event rollups for analytics queries.
 *
 * Schedule: Hourly
 * Authorization: Requires CRON_SECRET header
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { refreshClickEventRollups } from '@/lib/analytics/click-rollups';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

function verifyCronSecret(provided: string | undefined): boolean {
  const expected = env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function verifyOrigin(request: NextRequest): boolean {
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader === '1') {
    return true;
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (
    forwardedHost?.endsWith('.vercel.app') ||
    forwardedHost?.endsWith('.jov.ie') ||
    forwardedHost === 'jov.ie'
  ) {
    return true;
  }

  if (env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!verifyOrigin(request)) {
    logger.warn('[Click Rollups Cron] Rejected request from untrusted origin');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authHeader = request.headers.get('authorization');
  const cronSecret = authHeader?.replace('Bearer ', '');

  if (!env.CRON_SECRET) {
    logger.error('[Click Rollups Cron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (!verifyCronSecret(cronSecret)) {
    logger.warn('[Click Rollups Cron] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('[Click Rollups Cron] Starting rollup refresh');

    const result = await refreshClickEventRollups();

    logger.info('[Click Rollups Cron] Rollup refresh completed', {
      refreshed: result.refreshed,
      retentionDays: result.retentionDays,
      duration: `${result.durationMs}ms`,
      windowStart: result.windowStart.toISOString(),
      windowEnd: result.windowEnd.toISOString(),
    });

    return NextResponse.json({
      success: true,
      result: {
        refreshed: result.refreshed,
        retentionDays: result.retentionDays,
        windowStart: result.windowStart.toISOString(),
        windowEnd: result.windowEnd.toISOString(),
        durationMs: result.durationMs,
        reason: result.reason ?? null,
      },
    });
  } catch (error) {
    logger.error('[Click Rollups Cron] Rollup refresh failed', error);
    return NextResponse.json(
      { error: 'Rollup refresh failed' },
      { status: 500 }
    );
  }
}
