/**
 * Daily public-metric snapshots for known artists.
 *
 * Default-off until ARTIST_DAILY_SNAPSHOTS=true. Collects YouTube, Instagram,
 * and Wikipedia pageviews into the append-only artist_daily_snapshots table.
 * Logged-in payloads are refused. Source failures use the
 * remediation:artist-snapshots fingerprint.
 *
 * Schedule: 15 9 * * * UTC, after the previous day's Wikimedia pageviews
 * are usually published.
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
