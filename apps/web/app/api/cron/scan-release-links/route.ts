import { NextResponse } from 'next/server';
import { processReleaseLinkScans } from '@/lib/discography/release-link-scanner';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Cron job to process release link scans.
 *
 * Runs every 30 minutes to discover DSP links (Apple Music, Deezer, etc.)
 * for releases that have ISRC/UPC data. Increases scan frequency around
 * release dates (similar to feature.fm/linkfire).
 *
 * Schedule: Every 30 minutes (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await processReleaseLinkScans();

    logger.info(
      `[scan-release-links] Scanned ${result.scanned}, completed ${result.completed}, errors ${result.errors}`
    );

    return NextResponse.json(
      {
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[scan-release-links] Cron failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scan failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
