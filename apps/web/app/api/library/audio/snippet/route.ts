/**
 * Library Audio Snippet
 *
 * Reads and persists promo snippet trim windows on the primary release recording.
 */

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSnippetFromRecording,
  resolvePrimaryRecordingForRelease,
} from '@/lib/audio/resolve-release-recording';
import {
  AUDIO_SNIPPET_METADATA_KEY,
  normalizeSnippet,
  parseAudioSnippet,
} from '@/lib/audio/snippet';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const snippetSchema = z.object({
  releaseId: z.string().uuid(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
});

export async function GET(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  const releaseId = request.nextUrl.searchParams.get('releaseId');
  if (!releaseId) {
    return NextResponse.json(
      { error: 'releaseId is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
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

    const previewUrl = recording.previewUrl ?? recording.audioUrl;
    const snippet = getSnippetFromRecording(recording);

    return NextResponse.json(
      {
        recordingId: recording.recordingId,
        previewUrl,
        durationMs: recording.durationMs,
        snippet,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Library audio snippet read error', err);
    return NextResponse.json(
      { error: 'Failed to load audio snippet' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = snippetSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.format() },
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
      parsed.data.releaseId,
      profile.id
    );

    if (!recording) {
      return NextResponse.json(
        { error: 'Release recording not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!recording.previewUrl && !recording.audioUrl) {
      return NextResponse.json(
        { error: 'Release has no uploaded audio' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    const normalized = normalizeSnippet(
      {
        startMs: parsed.data.startMs,
        endMs: parsed.data.endMs,
      },
      recording.durationMs
    );

    if (!normalized) {
      return NextResponse.json(
        { error: 'Snippet trim range is invalid' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const nextMetadata = {
      ...recording.metadata,
      [AUDIO_SNIPPET_METADATA_KEY]: {
        ...normalized,
        updatedAt: new Date().toISOString(),
      },
    };

    await db
      .update(discogRecordings)
      .set({
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(discogRecordings.id, recording.recordingId),
          eq(discogRecordings.creatorProfileId, profile.id)
        )
      );

    revalidateTag(`releases:${clerkUserId}:${profile.id}`, 'max');
    revalidateTag(createSmartLinkContentTag(profile.id), 'max');

    return NextResponse.json(
      {
        success: true,
        snippet: parseAudioSnippet(nextMetadata),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Library audio snippet save error', err);
    return NextResponse.json(
      { error: 'Failed to save audio snippet' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
