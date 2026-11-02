/**
 * Daily per-song signals (Spotify popularity, YouTube views, Jovie release
 * click-outs) for allowlisted profiles. Default allowlist: tim. Kill switch:
 * TRACK_DAILY_SNAPSHOTS=false. Idempotent per song, source and UTC day.
 * Schedule: 25 9 * * * UTC.
 */
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import {
  isTrackDailySnapshotsEnabled,
  TRACK_SNAPSHOT_REMEDIATION_FINGERPRINT,
  TRACK_SNAPSHOT_ROUTE,
} from '@/lib/track-snapshots/contract';
import { runLiveTrackDailySnapshots } from '@/lib/track-snapshots/live';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: TRACK_SNAPSHOT_ROUTE,
  });
  if (authError) return authError;

  if (!isTrackDailySnapshotsEnabled()) {
    return NextResponse.json(
      { ok: true, enabled: false, skipped: 'kill_switch' },
      { headers: NO_STORE_HEADERS }
    );
  }

  try {
    const report = await runLiveTrackDailySnapshots();
    return NextResponse.json(
      { ok: report.failures.length === 0, ...report },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Track daily snapshots failed', error, {
      fingerprint: TRACK_SNAPSHOT_REMEDIATION_FINGERPRINT,
      route: TRACK_SNAPSHOT_ROUTE,
    });
    return NextResponse.json(
      { ok: false, error: 'Track daily snapshots failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
