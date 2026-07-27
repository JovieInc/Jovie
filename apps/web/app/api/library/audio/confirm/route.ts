/**
 * Library Audio Confirm
 *
 * Called after a client-side Blob upload completes. Verifies release ownership
 * and attaches the public audio URL to the first recording on the release when
 * the catalog is missing audio.
 */

import {
  type AudioPlaybackDerivative,
  getAudioCapability,
  getAudioFormat,
} from '@jovie/audio-contracts';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  nextAudioDerivativeGeneration,
  parseAudioPlaybackDerivative,
} from '@/lib/audio/playback-derivative';
import { resolvePrimaryRecordingForRelease } from '@/lib/audio/resolve-release-recording';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const confirmSchema = z.object({
  releaseId: z.string().uuid(),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  fileName: z.string().min(1),
  fileMimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = confirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { releaseId, blobUrl, fileMimeType, fileName } = parsed.data;
    const format = getAudioFormat({ name: fileName, type: fileMimeType });
    if (!format) {
      return NextResponse.json(
        { error: 'Unsupported audio file type' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profile } = await getSessionContext({
      clerkUserId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const recording = await resolvePrimaryRecordingForRelease(
      releaseId,
      profile.id
    );

    if (!recording) {
      return NextResponse.json(
        { error: 'Release recording not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (recording.previewUrl) {
      return NextResponse.json(
        { error: 'Release already has audio' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const playbackCapability = getAudioCapability(
      format.id,
      'web_chromium',
      'nativePlayback'
    );
    const now = new Date();
    const generation = nextAudioDerivativeGeneration(recording.metadata);
    const derivative: AudioPlaybackDerivative | null =
      playbackCapability === 'derivative_required'
        ? {
            status: 'pending',
            generation,
            sourceFormatId: format.id,
            requestedAt: now.toISOString(),
          }
        : null;
    const previousDerivative = parseAudioPlaybackDerivative(recording.metadata);
    const metadataDerivative: AudioPlaybackDerivative | null =
      derivative ??
      (previousDerivative &&
      ['pending', 'retrying'].includes(previousDerivative.status)
        ? {
            status: 'superseded',
            generation: previousDerivative.generation,
            sourceFormatId: previousDerivative.sourceFormatId,
            supersededAt: now.toISOString(),
          }
        : null);
    const previewUrl = playbackCapability === 'direct' ? blobUrl : null;

    await db.transaction(async tx => {
      await tx
        .update(discogRecordings)
        .set({
          previewUrl,
          audioUrl: blobUrl,
          audioFormat: format.canonicalMimeType,
          ...(metadataDerivative
            ? {
                metadata: drizzleSql`jsonb_set(
                  coalesce(${discogRecordings.metadata}, '{}'::jsonb),
                  '{audioPlaybackDerivative}',
                  ${JSON.stringify(metadataDerivative)}::jsonb,
                  true
                )`,
              }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(discogRecordings.id, recording.recordingId),
            eq(discogRecordings.creatorProfileId, profile.id)
          )
        );

      if (derivative) {
        await tx.insert(ingestionJobs).values({
          jobType: 'audio_playback_derivative',
          payload: {
            recordingId: recording.recordingId,
            creatorProfileId: profile.id,
            formatId: format.id,
            generation,
          },
          priority: -10,
          maxAttempts: 3,
          dedupKey: `audio_playback_derivative:${recording.recordingId}:${generation}`,
        });
      }
    });

    revalidateTag(`releases:${clerkUserId}:${profile.id}`, 'max');
    revalidateTag(createSmartLinkContentTag(profile.id), 'max');

    return NextResponse.json(
      {
        success: true,
        previewUrl,
        hasAudioMaster: true,
        playbackDerivative: derivative,
        recordingId: recording.recordingId,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Library audio confirm error', err);
    return NextResponse.json(
      { error: 'Failed to confirm audio upload' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
