/**
 * Data Retention Cleanup Cron Endpoint
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron)
 * to automatically delete analytics data older than the retention period.
 *
 * Schedule: Daily at 3:00 AM UTC
 * Authorization: Requires CRON_SECRET header
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cleanup

/**
 * Timing-safe comparison of cron secret to prevent timing attacks
 */
function verifyCronSecret(provided: string | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Verify request origin is from trusted sources (Vercel Cron or internal).
 * Defense in depth - verify source before checking secret.
 */
function verifyOrigin(request: NextRequest): boolean {
  // Vercel Cron requests include this header
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader === '1') {
    return true;
  }

  // Allow requests from Vercel's internal network or our domains
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (
    forwardedHost?.endsWith('.vercel.app') ||
    forwardedHost?.endsWith('.jov.ie') ||
    forwardedHost === 'jov.ie'
  ) {
    return true;
  }

  // In development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  // Verify request origin (defense in depth - verify source before checking secret)
  if (!verifyOrigin(request)) {
    logger.warn('[Data Retention Cron] Rejected request from untrusted origin');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = authHeader?.replace('Bearer ', '');

  if (!process.env.CRON_SECRET) {
    logger.error('[Data Retention Cron] CRON_SECRET not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (!verifyCronSecret(cronSecret)) {
    logger.warn('[Data Retention Cron] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('[Data Retention Cron] Starting scheduled cleanup');

    const result = await runDataRetentionCleanup();

    logger.info('[Data Retention Cron] Cleanup completed successfully', {
      clickEventsDeleted: result.clickEventsDeleted,
      audienceMembersDeleted: result.audienceMembersDeleted,
      notificationSubscriptionsDeleted: result.notificationSubscriptionsDeleted,
      duration: `${result.duration}ms`,
    });

    return NextResponse.json({
      success: true,
      result: {
        clickEventsDeleted: result.clickEventsDeleted,
        audienceMembersDeleted: result.audienceMembersDeleted,
        notificationSubscriptionsDeleted:
          result.notificationSubscriptionsDeleted,
        retentionDays: result.retentionDays,
        cutoffDate: result.cutoffDate.toISOString(),
        duration: result.duration,
      },
    });
  } catch (error) {
    // Log full error details internally
    logger.error('[Data Retention Cron] Cleanup failed', error);
    // Return sanitized error to prevent information disclosure
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
