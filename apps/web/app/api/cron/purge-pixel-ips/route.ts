import { sql as drizzleSql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;
const BATCH_SIZE = 1000;
const PURGE_THRESHOLD_HOURS = 48;

/**
 * Cron job to purge raw IP addresses from pixel events after 48 hours.
 *
 * Raw IPs are only needed for ad platform forwarding (Facebook CAPI, TikTok Events API).
 * After 48 hours, forwarding is long complete and the raw IP is no longer needed.
 * The hashed IP (ip_hash) is retained for analytics and deduplication.
 *
 * Schedule: Daily at 03:00 UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const startTime = Date.now();

  try {
    // PostgreSQL doesn't support LIMIT in UPDATE, so use a subquery
    const result = await db.execute(
      drizzleSql`UPDATE pixel_events
        SET client_ip = NULL
        WHERE id IN (
          SELECT id FROM pixel_events
          WHERE client_ip IS NOT NULL
            AND created_at < NOW() - INTERVAL '1 hour' * ${PURGE_THRESHOLD_HOURS}
          LIMIT ${BATCH_SIZE}
        )`
    );

    // Drizzle returns rowCount for UPDATE statements
    const purgedCount =
      typeof result === 'object' && result !== null && 'rowCount' in result
        ? (result.rowCount as number)
        : 0;

    const durationMs = Date.now() - startTime;

    logger.info('[purge-pixel-ips] Purge complete', {
      purgedCount,
      durationMs,
    });

    return NextResponse.json(
      {
        success: true,
        purgedCount,
        durationMs,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('[purge-pixel-ips] Purge failed:', error);
    await captureError('Pixel IP purge cron failed', error, {
      route: '/api/cron/purge-pixel-ips',
      method: 'GET',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Purge failed',
        durationMs,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
