'use server';

import {
  type AudioTimelineDocumentV1,
  createAudioTimelineDocument,
} from '@jovie/audio-contracts';
import { and, eq } from 'drizzle-orm';
import { getDashboardDataEssential } from '@/app/app/(shell)/dashboard/actions';
import { getOptionalAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { discogTracks } from '@/lib/db/schema/content';

/**
 * Durable persistence boundary for the canonical cue timeline
 * (`AudioTimelineDocumentV1`, `@jovie/audio-contracts`). Documents are stored
 * as jsonb on `discog_tracks.cue_timeline`; saves carry the revision the
 * client started from so concurrent editors conflict instead of clobbering.
 */

interface OwnedTrack {
  readonly id: string;
  readonly cueTimeline: Record<string, unknown> | null;
}

async function getOwnedTrack(trackId: string): Promise<OwnedTrack | null> {
  const { userId } = await getOptionalAuth();
  if (!userId) return null;

  const dashboardData = await getDashboardDataEssential();
  const selectedProfile = dashboardData.selectedProfile;
  if (!selectedProfile || selectedProfile.userId !== userId) return null;

  const [track] = await db
    .select({ id: discogTracks.id, cueTimeline: discogTracks.cueTimeline })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.id, trackId),
        eq(discogTracks.creatorProfileId, selectedProfile.id)
      )
    )
    .limit(1);

  if (!track) return null;
  return track;
}

function parseTimeline(
  raw: Record<string, unknown> | null,
  trackId: string
): AudioTimelineDocumentV1 | null {
  if (!raw) return null;
  try {
    const document = createAudioTimelineDocument({
      trackId: String(raw.trackId ?? trackId),
      revision: Number(raw.revision ?? 0),
      sampleRateHz: Number(raw.sampleRateHz),
      durationSamples:
        raw.durationSamples === null || raw.durationSamples === undefined
          ? null
          : Number(raw.durationSamples),
      cues: Array.isArray(raw.cues)
        ? raw.cues.map(cue => ({
            id: String(cue.id),
            kind: cue.kind,
            label: String(cue.label),
            sampleOffset: Number(cue.sampleOffset),
          }))
        : [],
      beatGrid: (raw.beatGrid as AudioTimelineDocumentV1['beatGrid']) ?? null,
    });
    return document.trackId === trackId ? document : null;
  } catch {
    return null;
  }
}

export async function loadTrackCueTimelineAction(
  trackId: string
): Promise<AudioTimelineDocumentV1 | null> {
  const track = await getOwnedTrack(trackId);
  if (!track) return null;
  return parseTimeline(track.cueTimeline, track.id);
}

export interface SaveTrackCueTimelineResult {
  readonly ok: boolean;
  readonly reason?: 'conflict' | 'invalid' | 'forbidden';
  readonly timeline?: AudioTimelineDocumentV1 | null;
}

export async function saveTrackCueTimelineAction(input: {
  readonly trackId: string;
  readonly timeline: AudioTimelineDocumentV1;
  /** Revision of the document the edit session started from. */
  readonly baseRevision: number;
}): Promise<SaveTrackCueTimelineResult> {
  const track = await getOwnedTrack(input.trackId);
  if (!track) return { ok: false, reason: 'forbidden' };

  let next: AudioTimelineDocumentV1;
  try {
    next = createAudioTimelineDocument(input.timeline);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (next.trackId !== track.id) return { ok: false, reason: 'invalid' };

  const stored = parseTimeline(track.cueTimeline, track.id);
  const storedRevision = stored?.revision ?? null;
  const isFirstSave = storedRevision === null;
  if (
    (!isFirstSave && storedRevision !== input.baseRevision) ||
    (isFirstSave && input.baseRevision !== 0)
  ) {
    return { ok: false, reason: 'conflict', timeline: stored };
  }

  await db
    .update(discogTracks)
    .set({ cueTimeline: next, updatedAt: new Date() })
    .where(eq(discogTracks.id, track.id));

  return { ok: true, timeline: next };
}
