/**
 * Library Audio Confirm
 *
 * Called after a client-side Blob upload completes. Verifies release ownership
 * and attaches the public audio URL to the first recording on the release when
 * the catalog is missing audio.
 */

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-aiff',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
]);

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

    const { releaseId, blobUrl, fileMimeType } = parsed.data;
    if (!ALLOWED_AUDIO_MIME_TYPES.has(fileMimeType)) {
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

    const [row] = await db
      .select({
        recordingId: discogRecordings.id,
        currentPreviewUrl: discogRecordings.previewUrl,
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
          eq(discogReleases.creatorProfileId, profile.id)
        )
      )
      .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber)
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { error: 'Release recording not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (row.currentPreviewUrl) {
      return NextResponse.json(
        { error: 'Release already has audio' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    await db
      .update(discogRecordings)
      .set({
        previewUrl: blobUrl,
        audioUrl: blobUrl,
        audioFormat: fileMimeType,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(discogRecordings.id, row.recordingId),
          eq(discogRecordings.creatorProfileId, profile.id)
        )
      );

    revalidateTag(`releases:${clerkUserId}:${profile.id}`, 'max');
    revalidateTag(createSmartLinkContentTag(profile.id), 'max');

    return NextResponse.json(
      { success: true, previewUrl: blobUrl },
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
