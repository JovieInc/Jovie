import { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import { processPendingEvents } from '@/lib/tracking/forwarding';
import { logger } from '@/lib/utils/logger';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Cron job to process pending pixel events and forward them to ad platforms.
 *
 * Forwards events to:
 * 1. Jovie's own marketing pixels (Facebook, Google, TikTok)
 * 2. Creator's configured pixels (if any)
 *
 * Schedule: Every 5 minutes (configured in vercel.json)
 */
export async function GET(request: Request) {
  // Verify cron secret in all environments
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const startTime = Date.now();

  try {
    // Process up to 500 events per run
    const result = await processPendingEvents(500);

    const duration = Date.now() - startTime;

    logger.info('[pixel-forwarding] Processing complete', {
      ...result,
      durationMs: duration,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${result.processed} events (${result.successful} successful, ${result.failed} failed)`,
        ...result,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('[pixel-forwarding] Processing failed:', error);
    await captureError('Pixel forwarding cron failed', error, { route: '/api/cron/pixel-forwarding', method: 'GET' });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
        durationMs: duration,
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
