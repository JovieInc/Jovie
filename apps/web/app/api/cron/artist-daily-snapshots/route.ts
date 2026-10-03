/**
 * Daily public-metric snapshots. Default-off until ARTIST_DAILY_SNAPSHOTS=true.
 * YouTube Data API when YOUTUBE_DATA_API_KEY is set; otherwise that source
 * skips. Social HTML waits for isolated egress. Wikipedia uses official APIs.
 * Schedule: 15 9 * * * UTC.
 */
import { NextResponse } from 'next/server';
import {
  ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
  ARTIST_SNAPSHOT_ROUTE,
  isArtistDailySnapshotsEnabled,
} from '@/lib/artist-snapshots/contract';
import { runLiveArtistDailySnapshots } from '@/lib/artist-snapshots/live';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
export const runtime = 'nodejs';
export const maxDuration = 300;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: ARTIST_SNAPSHOT_ROUTE,
  });
  if (authError) return authError;
  if (!isArtistDailySnapshotsEnabled()) {
    return NextResponse.json(
      { ok: true, enabled: false, skipped: 'flag_off' },
      { headers: NO_STORE_HEADERS }
    );
  }
  try {
    const report = await runLiveArtistDailySnapshots();
    return NextResponse.json(
      { ok: report.failures.length === 0, ...report },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Artist daily snapshots failed', error, {
      fingerprint: ARTIST_SNAPSHOT_REMEDIATION_FINGERPRINT,
      route: ARTIST_SNAPSHOT_ROUTE,
    });
    return NextResponse.json(
      { ok: false, error: 'Artist daily snapshots failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
