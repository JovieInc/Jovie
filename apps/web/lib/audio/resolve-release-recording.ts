import { and, eq } from 'drizzle-orm';
import { parseAudioSnippet } from '@/lib/audio/snippet';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';

export type ReleasePrimaryRecording = {
  readonly recordingId: string;
  readonly previewUrl: string | null;
  readonly audioUrl: string | null;
  readonly durationMs: number | null;
  readonly metadata: Record<string, unknown>;
};

export async function resolvePrimaryRecordingForRelease(
  releaseId: string,
  creatorProfileId: string
): Promise<ReleasePrimaryRecording | null> {
  const [row] = await db
    .select({
      recordingId: discogRecordings.id,
      previewUrl: discogRecordings.previewUrl,
      audioUrl: discogRecordings.audioUrl,
      durationMs: discogRecordings.durationMs,
      metadata: discogRecordings.metadata,
    })
    .from(discogReleases)
    .innerJoin(
      discogReleaseTracks,
      eq(discogReleaseTracks.releaseId, discogReleases.id)
    )
    .innerJoin(
      discogRecordings,
      eq(discogRecordings.id, discogReleaseTracks.recordingId)
    )
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, creatorProfileId)
      )
    )
    .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber)
    .limit(1);

  if (!row) return null;

  return {
    recordingId: row.recordingId,
    previewUrl: row.previewUrl,
    audioUrl: row.audioUrl,
    durationMs: row.durationMs,
    metadata: row.metadata ?? {},
  };
}

export function getSnippetFromRecording(
  recording: ReleasePrimaryRecording
): ReturnType<typeof parseAudioSnippet> {
  return parseAudioSnippet(recording.metadata);
}
