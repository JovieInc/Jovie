/**
 * Chat Audio Upload
 *
 * Accepts metadata after a client-side Blob upload, infers the target entity,
 * and routes the audio into the catalog (attach, reference, or new draft).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AudioBlobVerificationError,
  verifyAudioBlob,
} from '@/lib/audio/blob-verifier';
import { requireAuth } from '@/lib/auth/require-auth';
import { getSessionContext } from '@/lib/auth/session';
import { routeChatAudioUpload } from '@/lib/chat/route-audio-upload';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

const chatAudioSchema = chatToolSchema({
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  fileName: z.string().min(1),
  fileMimeType: z.string(),
  fileSizeBytes: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const { userId: clerkUserId, error } = await requireAuth();
  if (error) return error;

  try {
    const parsed = chatAudioSchema.safeParse(await request.json());
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

    const verifiedBlob = await verifyAudioBlob({
      blobUrl: parsed.data.blobUrl,
      blobPathname: parsed.data.blobPathname,
      userId: clerkUserId,
      surface: 'chat',
      fileName: parsed.data.fileName,
      fileMimeType: parsed.data.fileMimeType,
      maxSizeBytes: 157_286_400,
    });

    const result = await routeChatAudioUpload({
      clerkUserId,
      profileId: profile.id,
      ...parsed.data,
      blobUrl: verifiedBlob.url,
      blobPathname: verifiedBlob.pathname,
      fileMimeType: verifiedBlob.canonicalMimeType,
      fileSizeBytes: verifiedBlob.sizeBytes,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    if (err instanceof AudioBlobVerificationError) {
      return NextResponse.json(
        { error: err.message, code: err.code, rule: err.rule, cta: err.cta },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const message = err instanceof Error ? err.message : 'Audio upload failed';
    captureError('Chat audio upload error', err);
    return NextResponse.json(
      { error: message },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
