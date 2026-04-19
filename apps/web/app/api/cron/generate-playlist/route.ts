/**
 * Playlist Generation Cron Job
 *
 * Daily cron that generates a new playlist concept, discovers tracks,
 * curates the tracklist, generates cover art, and saves to the database
 * as "pending" for admin review.
 *
 * Schedule: daily at 6 AM UTC (configured in vercel.json)
 * Max duration: 120 seconds (LLM calls + Spotify searches + image gen)
 */

import { NextResponse } from 'next/server';
import {
  acquirePlaylistGenerationLease,
  getPlaylistEngineSettings,
  getPlaylistSpotifyStatus,
  releasePlaylistGenerationLease,
} from '@/lib/admin/platform-connections';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { generatePlaylist } from '@/lib/playlists/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  // Auth check
  const authError = verifyCronRequest(request, {
    route: '/api/cron/generate-playlist',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  const settings = await getPlaylistEngineSettings();
  const playlistEngineEnabled = await getAppFlagValue('PLAYLIST_ENGINE');
  if (!playlistEngineEnabled || !settings.enabled) {
    return NextResponse.json(
      { success: true, skipped: true, reason: 'Playlist engine is disabled' },
      { headers: NO_STORE }
    );
  }

  const eligibilityCheckAt = new Date();
  if (settings.nextEligibleAt && settings.nextEligibleAt > eligibilityCheckAt) {
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        reason: 'Playlist engine is not eligible yet',
        nextEligibleAt: settings.nextEligibleAt.toISOString(),
      },
      { headers: NO_STORE }
    );
  }

  const spotifyStatus = await getPlaylistSpotifyStatus();
  if (!spotifyStatus.healthy) {
    captureError(
      '[Playlist Cron] Spotify OAuth health check failed. Skipping generation.',
      null,
      { source: spotifyStatus.source, error: spotifyStatus.error }
    );
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        reason:
          spotifyStatus.error ??
          'Spotify OAuth health check failed. Re-link Spotify in admin settings.',
      },
      { headers: NO_STORE }
    );
  }

  const lease = await acquirePlaylistGenerationLease(new Date());
  if (!lease.claimed) {
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        reason: 'Playlist generation is already in progress or not eligible',
      },
      { headers: NO_STORE }
    );
  }

  let result: Awaited<ReturnType<typeof generatePlaylist>>;
  try {
    // Run the pipeline. The admin DB eligibility gate is the cadence control.
    result = await generatePlaylist({
      skipComplianceCheck: true,
      recordCadenceOnSuccess: true,
    });
  } catch (error) {
    await releasePlaylistGenerationLease(lease);
    throw error;
  }

  if (!result.success || result.skipped) {
    await releasePlaylistGenerationLease(lease);
  }

  return NextResponse.json(
    {
      success: result.success,
      skipped: result.skipped,
      skipReason: result.skipReason,
      playlistId: result.playlistId,
      title: result.title,
      trackCount: result.trackCount,
      error: result.error,
      durationMs: result.durationMs,
    },
    {
      status: result.success ? 200 : 500,
      headers: NO_STORE,
    }
  );
}
