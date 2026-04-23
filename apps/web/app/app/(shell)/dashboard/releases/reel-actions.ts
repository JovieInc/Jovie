'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import {
  artists,
  discogReleases,
  releaseArtists,
} from '@/lib/db/schema/content';
import {
  type ReelJob,
  type ReelTemplateInputs,
  reelJobs,
} from '@/lib/db/schema/reel-jobs';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { requireProfileId } from '../requireProfileId';

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

async function requireReleaseAccess(
  releaseId: string,
  profileId: string
): Promise<{
  id: string;
  title: string;
  releaseDate: Date | null;
  artworkUrl: string | null;
}> {
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .limit(1);
  if (!release) throw new Error('Release not found or access denied');
  return release;
}

async function loadPrimaryArtistName(releaseId: string): Promise<string> {
  const rows = await db
    .select({
      name: artists.name,
      role: releaseArtists.role,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
    .where(eq(releaseArtists.releaseId, releaseId));
  const primary = rows.find(r => r.role === 'main_artist') ?? rows[0];
  return primary?.name ?? 'Artist';
}

export type GenerateReelResult =
  | { ok: true; jobId: string; status: 'queued' | 'succeeded' }
  | {
      ok: false;
      reason: 'flag_off' | 'recent_job_exists' | 'unauthorized';
      jobId?: string;
    };

/**
 * Queue a reel render for a release. Flag-gated, per-release idempotent within
 * a 5-minute window. Returns the reel_jobs row id; the cron processor picks it up.
 */
export async function generateReel(
  releaseId: string
): Promise<GenerateReelResult> {
  const profileId = await requireProfileId();
  const flagOn = await getAppFlagValue('VIRAL_REEL_MVP');
  if (!flagOn) return { ok: false, reason: 'flag_off' };

  const release = await requireReleaseAccess(releaseId, profileId);

  // Idempotency: if a non-failed job exists within the window, return it.
  const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const [existing] = await db
    .select({ id: reelJobs.id, status: reelJobs.status })
    .from(reelJobs)
    .where(
      and(
        eq(reelJobs.releaseId, releaseId),
        inArray(reelJobs.status, ['queued', 'rendering', 'succeeded'])
      )
    )
    .orderBy(reelJobs.createdAt)
    .limit(1);
  if (existing && existing.status === 'succeeded') {
    return { ok: true, jobId: existing.id, status: 'succeeded' };
  }
  if (existing) {
    return { ok: false, reason: 'recent_job_exists', jobId: existing.id };
  }

  const artistName = await loadPrimaryArtistName(releaseId);

  const templateInputs: ReelTemplateInputs = {
    artistName,
    releaseTitle: release.title,
    releaseDate: release.releaseDate ? release.releaseDate.toISOString() : null,
    artworkUrl: release.artworkUrl,
    watermark: true,
  };

  const [row] = await db
    .insert(reelJobs)
    .values({
      creatorProfileId: profileId,
      releaseId,
      templateSlug: 'teaser-v1',
      status: 'queued',
      templateInputs,
    })
    .returning({ id: reelJobs.id });

  if (!row) throw new Error('Failed to create reel job');

  revalidatePath(APP_ROUTES.DASHBOARD_RELEASES);
  void windowStart; // reserved for future window-based dedup tightening

  return { ok: true, jobId: row.id, status: 'queued' };
}

export async function getReelJob(jobId: string): Promise<ReelJob | null> {
  const profileId = await requireProfileId();
  const [row] = await db
    .select()
    .from(reelJobs)
    .where(
      and(eq(reelJobs.id, jobId), eq(reelJobs.creatorProfileId, profileId))
    )
    .limit(1);
  return row ?? null;
}

export async function listReelJobsForRelease(
  releaseId: string
): Promise<ReelJob[]> {
  const profileId = await requireProfileId();
  await requireReleaseAccess(releaseId, profileId);
  return db
    .select()
    .from(reelJobs)
    .where(
      and(
        eq(reelJobs.releaseId, releaseId),
        eq(reelJobs.creatorProfileId, profileId)
      )
    )
    .orderBy(reelJobs.createdAt);
}

// Exported for the cron processor + tests.
// Claims one queued job atomically by updating by id. Not FOR UPDATE SKIP
// LOCKED — cron fires every 1 minute and a double-claim is bounded by the
// idempotency window. If two cron instances race, the second will no-op
// because `queued` status no longer matches.
export async function claimNextReelJob(): Promise<ReelJob | null> {
  const [candidate] = await db
    .select({ id: reelJobs.id })
    .from(reelJobs)
    .where(eq(reelJobs.status, 'queued'))
    .orderBy(reelJobs.createdAt)
    .limit(1);
  if (!candidate) return null;
  const [row] = await db
    .update(reelJobs)
    .set({ status: 'rendering', startedAt: new Date() })
    .where(and(eq(reelJobs.id, candidate.id), eq(reelJobs.status, 'queued')))
    .returning();
  return row ?? null;
}

export async function markReelJobSucceeded(
  jobId: string,
  outputUrl: string,
  durationMs: number
): Promise<void> {
  await db
    .update(reelJobs)
    .set({
      status: 'succeeded',
      outputUrl,
      durationMs,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(reelJobs.id, jobId));
}

export async function markReelJobFailed(
  jobId: string,
  error: string
): Promise<void> {
  await db
    .update(reelJobs)
    .set({
      status: 'failed',
      error: error.slice(0, 2000),
      completedAt: new Date(),
    })
    .where(eq(reelJobs.id, jobId));
  captureError('reel job failed', new Error(error), {
    context: 'reel-actions',
    jobId,
  });
}
